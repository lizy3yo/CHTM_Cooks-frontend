import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';

export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	const decoded = getUserFromToken(event);
	if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
	if (decoded.role !== 'superadmin') return json({ error: 'Forbidden' }, { status: 403 });

	try {
		const url = new URL(event.request.url);
		const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500'), 1000);
		const page = Math.max(parseInt(url.searchParams.get('page') ?? '1'), 1);
		const userId = url.searchParams.get('userId');
		const skip = (page - 1) * limit;

		const db = await getDatabase();
		const col = db.collection('request_audit_events');

		const filter: Record<string, unknown> = {};
		if (userId) filter.userId = userId;

		const [events, total] = await Promise.all([
			col.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
			col.countDocuments(filter)
		]);

		// Extract unique user IDs for batch database lookup
		const userIds = [...new Set(events.map((e) => e.userId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
		const userMap = new Map<string, { fullName: string; profilePhotoUrl?: string; role: string }>();

		if (userIds.length > 0) {
			const objectIds = userIds
				.map((id) => {
					try {
						return new ObjectId(id);
					} catch {
						return null;
					}
				})
				.filter((oid): oid is ObjectId => oid !== null);

			if (objectIds.length > 0) {
				const users = await db
					.collection('users')
					.find({ _id: { $in: objectIds } })
					.toArray();

				for (const u of users) {
					userMap.set(u._id.toString(), {
						fullName: `${u.firstName} ${u.lastName}`,
						profilePhotoUrl: u.profilePhotoUrl,
						role: u.role
					});
				}
			}
		}

		const mapped = events.map((entry) => {
			const uInfo = entry.userId ? userMap.get(entry.userId) : null;
			return {
				requestId: entry.requestId,
				userId: entry.userId,
				userRole: uInfo?.role ?? entry.userRole,
				userName: uInfo?.fullName ?? 'System',
				userProfilePhotoUrl: uInfo?.profilePhotoUrl,
				method: entry.method,
				path: entry.path,
				statusCode: entry.statusCode,
				responseTimeMs: entry.responseTimeMs,
				ipAddress: entry.ipAddress,
				userAgent: entry.userAgent,
				timestamp: entry.timestamp as Date
			};
		});

		logger.info('Request audit events retrieved', { userId: decoded.userId, count: mapped.length, total });

		return json({
			events: mapped,
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		});
	} catch (error) {
		logger.error('Error retrieving request audit events', { error });
		return json({ error: 'Failed to retrieve request audit events' }, { status: 500 });
	}
};