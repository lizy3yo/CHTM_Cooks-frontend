/**
 * replacement Obligations API Client
 *
 * Client-side cache + SSE subscription — mirrors the donations.ts pattern.
 * Credentials are sent via httpOnly cookies (credentials: 'include').
 */

import { subscribeToTopic, type RealtimeTopic } from './realtime';
import { QueryCache } from './queryCache';
import { getApiErrorMessage } from './session';

export type ObligationType = 'missing' | 'damaged';
export type ObligationStatus = 'pending' | 'replaced';
export type ResolutionType = 'replacement';

export interface ReplacementObligation {
	id: string;
	borrowRequestId: string;
	studentId: string;
	studentName?: string;
	studentEmail?: string;
	studentProfilePhotoUrl?: string;
	itemId: string;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number; // Quantity of items to be replaced
	amountPaid: number; // Quantity of items already replaced
	balance: number; // Remaining items to be replaced
	resolutionType?: ResolutionType;
	resolutionDate?: string;
	resolutionNotes?: string;
	paymentReference?: string; // Replacement tracking reference
	incidentDate: string;
	incidentNotes?: string;
	dueDate: string;
	createdAt: string;
	updatedAt: string;
}

export interface ReplacementObligationsListResponse {
	obligations: ReplacementObligation[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

export interface ResolveReplacementObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number; // Quantity of items being replaced
	resolutionNotes?: string;
	paymentReference?: string; // Replacement tracking reference
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

interface RequestOptions {
	forceRefresh?: boolean;
}

// ─── Client-side cache ───────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<unknown>>();

// Entries are kept until the realtime hub reports a change, then revalidated
// on next use; requests already in flight when it changes are not reused.
// Obligations are created by a return inspection, so request changes count too.
const CACHE_OPTIONS = {
	topics: ['replacement_obligation_change', 'borrow_request_change'] as RealtimeTopic[],
	onStale: () => inFlight.clear()
};
const listCache = new QueryCache<ReplacementObligationsListResponse>(CACHE_OPTIONS);
const detailCache = new QueryCache<{ obligation: ReplacementObligation }>(CACHE_OPTIONS);

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const opts: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) opts.body = JSON.stringify(body);
	return opts;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message = await getApiErrorMessage(
			response,
			payload.message || payload.error || `Request failed with status ${response.status}`
		);
		throw new Error(message);
	}
	return payload;
}

function getFreshCache<T>(cache: QueryCache<T>, key: string): T | null {
	return cache.getFresh(key);
}

function setCache<T>(cache: QueryCache<T>, key: string, data: T): void {
	cache.set(key, data);
}

function buildListCacheKey(
	params: {
		status?: ObligationStatus;
		studentId?: string;
		page?: number;
		limit?: number;
	} = {}
): string {
	return [
		params.status || 'all',
		params.studentId || 'self',
		String(params.page || 1),
		String(params.limit || 50)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.markStale();
	detailCache.markStale();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const replacementObligationsAPI = {
	/**
	 * Fetch paginated replacement obligations with optional filters.
	 */
	async getObligations(
		params: {
			status?: ObligationStatus;
			studentId?: string;
			page?: number;
			limit?: number;
		} = {},
		options: RequestOptions = {}
	): Promise<ReplacementObligationsListResponse> {
		const searchParams = new URLSearchParams();
		if (params.status) searchParams.set('status', params.status);
		if (params.studentId) searchParams.set('studentId', params.studentId);
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (options.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/replacement-obligations${query ? `?${query}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<ReplacementObligationsListResponse>
				| undefined;
			if (existing) return existing;
		}

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<ReplacementObligationsListResponse>(res);
			setCache(listCache, cacheKey, data);
			return data;
		})();

		inFlight.set(inFlightKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	/**
	 * Fetch a single replacement obligation by ID.
	 */
	async getObligation(
		id: string,
		options: RequestOptions = {}
	): Promise<{ obligation: ReplacementObligation }> {
		const inFlightKey = `detail:${id}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(detailCache, id);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<{ obligation: ReplacementObligation }>
				| undefined;
			if (existing) return existing;
		}

		const url = options.forceRefresh
			? `/api/replacement-obligations/${id}?_t=${Date.now()}`
			: `/api/replacement-obligations/${id}`;

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ obligation: ReplacementObligation }>(res);
			setCache(detailCache, id, data);
			return data;
		})();

		inFlight.set(inFlightKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	/**
	 * Resolve a replacement obligation (item replacement).
	 * Invalidates all client-side caches on success.
	 */
	async resolveObligation(
		id: string,
		resolution: ResolveReplacementObligationRequest
	): Promise<{ success: boolean; message: string; settled?: number; surplus?: number }> {
		const res = await fetch(
			`/api/replacement-obligations/${id}`,
			getFetchOptions('PATCH', resolution)
		);
		const data = await handleResponse<{ success: boolean; message: string; settled?: number; surplus?: number }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Reconcile stale 'missing' borrow requests where all obligations are already resolved.
	 * Call once on page mount to fix any records that pre-date the auto-resolve logic.
	 * Fails silently — non-critical path.
	 */
	async reconcile(): Promise<{ reconciled: number }> {
		try {
			const res = await fetch(
				'/api/replacement-obligations/reconcile',
				getFetchOptions('POST')
			);
			return await handleResponse<{ reconciled: number }>(res);
		} catch {
			return { reconciled: 0 };
		}
	},

	/**
	 * Subscribe to real-time replacement obligation changes via SSE.
	 * Invalidates client cache and calls `onEvent` on every change.
	 * Returns an unsubscribe function — call it in component cleanup.
	 */
	subscribeToChanges(onEvent: () => void): () => void {
		return subscribeToTopic('replacement_obligation_change', onEvent);
	},

	// ─── Cache utilities ────────────────────────────────────────────────────

	peekCachedObligations(
		params: {
			status?: ObligationStatus;
			studentId?: string;
			page?: number;
			limit?: number;
		} = {}
	): ReplacementObligationsListResponse | null {
		return listCache.peek(buildListCacheKey(params));
	},

	peekCachedObligation(id: string): { obligation: ReplacementObligation } | null {
		return detailCache.peek(id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};
