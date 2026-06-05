import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { ObjectId } from 'mongodb';

/**
 * GET /api/auth/audit-events
 *
 * Returns login/logout events from the auth_events collection for ALL roles.
 * Also synthesises a login event from users.lastLogin for any user who has
 * never had an auth_event recorded (pre-existing accounts / before this feature
 * was deployed), so every user who has ever logged in appears in the audit trail.
 *
 * Superadmin-only.
 */
export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	const decoded = getUserFromToken(event);
	if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
	if (decoded.role !== 'superadmin') return json({ error: 'Forbidden' }, { status: 403 });

	try {
		const url    = new URL(event.request.url);
		const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '500'), 1000);
		const page   = Math.max(parseInt(url.searchParams.get('page')   ?? '1'), 1);
		const userId = url.searchParams.get('userId');
		const skip   = (page - 1) * limit;

		const db  = await getDatabase();
		const col = db.collection('auth_events');

		// Ensure TTL index exists (idempotent, background)
		void col.createIndex(
			{ occurredAt: 1 },
			{ expireAfterSeconds: 90 * 24 * 60 * 60, background: true }
		);

		const filter: Record<string, unknown> = {};
		if (userId) filter.userId = new ObjectId(userId);

		const [events, total] = await Promise.all([
			col.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(limit).toArray(),
			col.countDocuments(filter)
		]);

		// Collect all unique userIds that already have auth_events
		const userIdsWithEvents = new Set(events.map(e => e.userId?.toString()).filter(Boolean));

		// Batch-fetch profile photos + names for all users in this page
		const uniqueIds = [...userIdsWithEvents];
		const photoMap  = new Map<string, string | null>();
		const nameMap   = new Map<string, { name: string; role: string; email: string }>();

		if (uniqueIds.length > 0) {
			const users = await db
				.collection('users')
				.find(
					{ _id: { $in: uniqueIds.map(id => new ObjectId(id)) } },
					{ projection: { _id: 1, profilePhotoUrl: 1, firstName: 1, lastName: 1, role: 1, email: 1 } }
				)
				.toArray();
			for (const u of users) {
				const id = u._id.toString();
				photoMap.set(id, u.profilePhotoUrl ?? null);
				nameMap.set(id, {
					name:  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
					role:  u.role,
					email: u.email
				});
			}
		}

		const mapped = events.map(e => {
			const uid  = e.userId?.toString() ?? '';
			const info = nameMap.get(uid);
			return {
				id:                  e._id.toString(),
				action:              e.action as 'login' | 'logout',
				userId:              uid,
				userName:            e.userName ?? info?.name ?? '',
				userRole:            e.userRole ?? info?.role ?? '',
				email:               e.email    ?? info?.email ?? '',
				ipAddress:           e.ipAddress ?? null,
				userProfilePhotoUrl: photoMap.get(uid) ?? undefined,
				occurredAt:          e.occurredAt as Date
			};
		});

		// ── Synthesise login events from lastLogin for users with no auth_events ──
		// This ensures all users (all roles) appear even before this feature was deployed.
		if (!userId) {
			const allUsers = await db
				.collection('users')
				.find(
					{ lastLogin: { $exists: true, $ne: null } },
					{ projection: { _id: 1, firstName: 1, lastName: 1, role: 1, email: 1, profilePhotoUrl: 1, lastLogin: 1 } }
				)
				.toArray();

			for (const u of allUsers) {
				const uid = u._id.toString();
				if (!userIdsWithEvents.has(uid)) {
					// No auth_events for this user — synthesise from lastLogin
					mapped.push({
						id:                  `synthetic-${uid}`,
						action:              'login',
						userId:              uid,
						userName:            `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
						userRole:            u.role,
						email:               u.email,
						ipAddress:           null,
						userProfilePhotoUrl: u.profilePhotoUrl ?? undefined,
						occurredAt:          u.lastLogin as Date
					});
				}
			}
		}

		// Re-sort after synthetic entries are added
		mapped.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

		logger.info('Auth audit events retrieved', { userId: decoded.userId, count: mapped.length });

		return json({
			events: mapped,
			total:  total + (mapped.length - events.length), // include synthetic count
			page,
			limit,
			pages: Math.ceil((total + (mapped.length - events.length)) / limit)
		});
	} catch (error) {
		logger.error('Error retrieving auth audit events', { error });
		return json({ error: 'Failed to retrieve auth events' }, { status: 500 });
	}
};
