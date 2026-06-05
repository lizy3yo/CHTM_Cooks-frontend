import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

export interface AuthAuditEvent {
	id: string;
	action: 'login' | 'logout';
	userId: string;
	userName: string;
	userRole: string;
	email: string;
	ipAddress: string | null;
	userProfilePhotoUrl?: string;
	occurredAt: Date;
}

export interface AuthAuditEventsResponse {
	events: AuthAuditEvent[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

function getFetchOptions(): RequestInit {
	return { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

async function handleResponse<T>(res: Response): Promise<T> {
	const payload = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
	if (!res.ok) {
		const msg = (payload as any).message || (payload as any).error || `Request failed: ${res.status}`;
		throw new Error(await getApiErrorMessage(res, msg));
	}
	return payload;
}

// 2-minute client-side cache
const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: { data: AuthAuditEventsResponse; expiresAt: number } | null = null;

export const authAuditEventsAPI = {
	async getEvents(
		params: { limit?: number; page?: number; userId?: string; forceRefresh?: boolean } = {}
	): Promise<AuthAuditEventsResponse> {
		if (!browser) return { events: [], total: 0, page: 1, limit: 500, pages: 0 };

		if (!params.forceRefresh && cache && Date.now() < cache.expiresAt) {
			return cache.data;
		}

		const q = new URLSearchParams();
		if (params.limit)  q.set('limit',  String(params.limit));
		if (params.page)   q.set('page',   String(params.page));
		if (params.userId) q.set('userId', params.userId);
		if (params.forceRefresh) q.set('_t', String(Date.now()));

		const res = await fetch(
			`/api/auth/audit-events${q.toString() ? `?${q}` : ''}`,
			getFetchOptions()
		);
		const data = await handleResponse<AuthAuditEventsResponse>(res);

		// Deserialise dates
		data.events = data.events.map(e => ({ ...e, occurredAt: new Date(e.occurredAt) }));

		cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
		return data;
	},

	invalidateCache(): void {
		cache = null;
	},

	peekCache(): AuthAuditEventsResponse | null {
		if (!browser || !cache || Date.now() >= cache.expiresAt) return null;
		return cache.data;
	}
};
