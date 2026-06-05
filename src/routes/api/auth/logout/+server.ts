import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { revokeRememberMeToken } from '$lib/server/middleware/auth/rememberMe';
import { rememberMeService } from '$lib/server/services/auth';
import { clearAuthCookies } from '$lib/server/middleware/auth/cookies';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';

/**
 * Record a logout event to the auth_events audit collection.
 * Fire-and-forget — never blocks the response.
 */
async function recordLogoutEvent(
	userId: string,
	userName: string,
	userRole: string,
	email: string,
	ip: string,
	userAgent: string | null
): Promise<void> {
	try {
		const db = await getDatabase();
		await db.collection('auth_events').insertOne({
			action: 'logout',
			userId: new ObjectId(userId),
			userName,
			userRole,
			email,
			ipAddress: ip,
			userAgent: userAgent ?? undefined,
			occurredAt: new Date()
		});
	} catch {
		// Non-critical
	}
}

/**
 * Logout Endpoint
 *
 * Logs out the user by:
 * 1. Clearing auth tokens (access/refresh) from cookies
 * 2. Revoking the remember-me token (if exists)
 * 3. Clearing the remember-me cookie
 */
export const POST = async (event: RequestEvent) => {
	try {
		// Capture user identity before clearing cookies
		const decoded = getUserFromToken(event);
		const clientIP =
			(event.request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
			event.getClientAddress() ||
			'unknown';
		const userAgent = event.request.headers.get('user-agent');

		// Clear all authentication cookies
		clearAuthCookies(event);

		// Revoke remember-me token and clear cookie
		await revokeRememberMeToken(event);

		// Record logout audit event (fire-and-forget)
		if (decoded) {
			const db = await getDatabase();
			const user = await db.collection('users').findOne(
				{ _id: new ObjectId(decoded.userId) },
				{ projection: { firstName: 1, lastName: 1, email: 1, role: 1 } }
			);
			const userName = user
				? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
				: decoded.email;
			void recordLogoutEvent(decoded.userId, userName, decoded.role, decoded.email, clientIP, userAgent);
		}

		return json({ success: true, message: 'Logged out successfully' }, { status: 200 });
	} catch (error) {
		console.error('Logout error:', error);
		return json({ error: 'Logout failed' }, { status: 500 });
	}
};

/**
 * DELETE: Logout from all devices
 * Revokes all remember-me tokens for the user
 */
export const DELETE = async (event: RequestEvent) => {
	try {
		const { request } = event;
		const body = await request.json();
		
		if (!body.userId) {
			return json({ error: 'User ID required' }, { status: 400 });
		}
		
		// Clear all authentication cookies for current session
		clearAuthCookies(event);
		
		// Revoke all tokens for user
		const count = await rememberMeService.revokeAllUserTokens(
			body.userId,
			'User logged out from all devices'
		);
		
		// Clear current remember-me cookie
		await revokeRememberMeToken(event);
		
		return json(
			{ success: true, message: `Logged out from ${count} device(s)` },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Logout all devices error:', error);
		return json(
			{ error: 'Failed to logout from all devices' },
			{ status: 500 }
		);
	}
};
