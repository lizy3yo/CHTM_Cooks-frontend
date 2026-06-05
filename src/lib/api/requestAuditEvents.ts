import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

export interface RequestAuditEvent {
	requestId: string;
	userId?: string;
	userRole?: string;
	userName?: string;
	userProfilePhotoUrl?: string;
	method: string;
	path: string;
	statusCode: number;
	responseTimeMs: number;
	ipAddress?: string;
	userAgent?: string;
	timestamp: Date;
}

export interface RequestAuditEventsResponse {
	events: RequestAuditEvent[];
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

const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: { data: RequestAuditEventsResponse; expiresAt: number } | null = null;

export const requestAuditEventsAPI = {
	async getEvents(
		params: { limit?: number; page?: number; userId?: string; forceRefresh?: boolean } = {}
	): Promise<RequestAuditEventsResponse> {
		if (!browser) return { events: [], total: 0, page: 1, limit: 500, pages: 0 };

		if (!params.forceRefresh && cache && Date.now() < cache.expiresAt) {
			return cache.data;
		}

		const q = new URLSearchParams();
		if (params.limit)  q.set('limit', String(params.limit));
		if (params.page)   q.set('page', String(params.page));
		if (params.userId) q.set('userId', params.userId);
		if (params.forceRefresh) q.set('_t', String(Date.now()));

		const res = await fetch(
			`/api/audit/request-events${q.toString() ? `?${q}` : ''}`,
			getFetchOptions()
		);
		const data = await handleResponse<RequestAuditEventsResponse>(res);

		data.events = data.events.map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

		cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
		return data;
	},

	invalidateCache(): void {
		cache = null;
	},

	peekCache(): RequestAuditEventsResponse | null {
		if (!browser || !cache || Date.now() >= cache.expiresAt) return null;
		return cache.data;
	}
};