/**
 * Donations API Client
 * Item-based donations — client-side cache + SSE subscription.
 */

import { browser } from '$app/environment';
import { subscribeToTopic } from './realtime';
import { getApiErrorMessage } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DonationResponse {
	id: string;
	receiptNumber: string;
	donorName: string;
	itemName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	inventoryAction: 'new_item' | 'add_to_existing';
	inventoryItemId?: string;
	/** Photo of the donated inventory item, if it has one. */
	picture?: string | null;
	/** Name of the staff member who logged the donation. */
	recordedBy?: string | null;
	/** Declared cost of one unit, and of the whole donation; null when not declared. */
	unitCost?: number | null;
	totalValue?: number | null;
	/** Deed of donation: pending until the signed copy is uploaded. */
	deedStatus?: 'pending' | 'signed';
	deedFileUrl?: string | null;
	deedSignedAt?: string | null;
	/** The deed this line was given under, shared by every item on it. */
	deed?: DonationDeed | null;
	/** An amount on an official receipt: recorded, but nothing added to stock. */
	receiptOnly?: boolean;
	createdAt: string;
	updatedAt: string;
}

export type DonationProgram = 'BSHM' | 'BSTM';

/** One deed of donation: who gave it, for which program, and the signed copy. */
export interface DonationDeed {
	id: string;
	reference: string;
	representativeName: string;
	submitterEmail?: string | null;
	studentId?: string | null;
	program?: DonationProgram | null;
	dateDonated?: string | null;
	orNumber?: string | null;
	/** The total written on the deed, which may differ from the item prices. */
	declaredTotal?: number | null;
	notes?: string | null;
	/** Signed deed files (PDF or image). */
	files: string[];
}

export interface DeedItemInput {
	itemName: string;
	quantity: number;
	unitCost?: number;
	unit?: string;
	/** Category a new inventory item is filed under. */
	toolsOrEquipment?: 'Tools' | 'Equipment';
}

/** A deed with its items, or with only an OR number and an amount. */
export interface CreateDeedRequest {
	representativeName: string;
	email?: string;
	program: DonationProgram;
	dateDonated: string;
	orNumber?: string;
	declaredTotal?: number;
	notes?: string;
	files?: string[];
	items: DeedItemInput[];
}

/** Donation that creates a new inventory item */
export interface CreateDonationNewItemRequest {
	inventoryAction: 'new_item';
	donorName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	unitCost?: number;
	// Inventory item fields
	itemName: string;
	category: string;
	categoryId?: string;
	specification?: string;
	toolsOrEquipment?: string;
	picture?: string;
}

/** Donation that adds quantity to an existing inventory item */
export interface CreateDonationAddToExistingRequest {
	inventoryAction: 'add_to_existing';
	donorName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	unitCost?: number;
	inventoryItemId: string;
}

export type CreateDonationRequest = CreateDonationNewItemRequest | CreateDonationAddToExistingRequest;

export interface AddDonationQuantityRequest {
	quantityToAdd: number;
	notes?: string;
}

export interface UpdateDonationRequest {
	donorName?: string;
	purpose?: string;
	date?: string;
	notes?: string;
	quantity?: number;
}

export interface DonationsListResponse {
	donations: DonationResponse[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const listCache = new Map<string, CacheEntry<DonationsListResponse>>();
const detailCache = new Map<string, CacheEntry<{ donation: DonationResponse }>>();
const inFlight = new Map<string, Promise<unknown>>();

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) options.body = JSON.stringify(body);
	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message = await getApiErrorMessage(response, payload.message || payload.error || `Request failed: ${response.status}`);
		throw new Error(message);
	}
	return payload;
}

function getFreshCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
	if (!browser) return null;
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
	if (!browser) return;
	cache.set(key, { data, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
}

function buildListCacheKey(params: { search?: string; page?: number; limit?: number }): string {
	return [params.search || 'all', String(params.page || 1), String(params.limit || 50)].join(':');
}

function invalidateAllCaches(): void {
	listCache.clear();
	detailCache.clear();
	inFlight.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const donationsAPI = {
	/**
	 * Fetch paginated donations list.
	 */
	async getAll(
		params: { search?: string; page?: number; limit?: number; forceRefresh?: boolean } = {}
	): Promise<DonationsListResponse> {
		const searchParams = new URLSearchParams();
		if (params.search) searchParams.set('search', params.search);
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (params.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/donations${query ? `?${query}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!params.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as Promise<DonationsListResponse> | undefined;
			if (existing) return existing;
		}

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<DonationsListResponse>(res);
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
	 * Fetch a single donation by ID.
	 */
	async getById(id: string, forceRefresh = false): Promise<{ donation: DonationResponse }> {
		const inFlightKey = `detail:${id}`;

		if (!forceRefresh) {
			const cached = getFreshCache(detailCache, id);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<{ donation: DonationResponse }>
				| undefined;
			if (existing) return existing;
		}

		const url = forceRefresh ? `/api/donations/${id}?_t=${Date.now()}` : `/api/donations/${id}`;
		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ donation: DonationResponse }>(res);
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
	 * Create a new item donation record.
	 */
	async create(payload: CreateDonationRequest): Promise<DonationResponse> {
		const res = await fetch('/api/donations', getFetchOptions('POST', payload));
		const data = await handleResponse<DonationResponse>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Add quantity to an existing donation record.
	 */
	async addQuantity(id: string, payload: AddDonationQuantityRequest): Promise<DonationResponse> {
		const res = await fetch(`/api/donations/${id}`, getFetchOptions('PATCH', payload));
		const data = await handleResponse<DonationResponse>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Update an existing donation record.
	 */
	async update(id: string, payload: UpdateDonationRequest): Promise<DonationResponse> {
		const res = await fetch(`/api/donations/${id}`, getFetchOptions('PUT', payload));
		const data = await handleResponse<DonationResponse>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Record the uploaded signed deed of donation, marking the deed as signed.
	 */
	async attachDeed(id: string, fileUrls: string | string[]): Promise<DonationResponse> {
		const body = Array.isArray(fileUrls) ? { fileUrls } : { fileUrl: fileUrls };
		const res = await fetch(`/api/donations/${id}/deed`, getFetchOptions('POST', body));
		const data = await handleResponse<DonationResponse>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Record a deed of donation with all of its items.
	 */
	async createDeed(payload: CreateDeedRequest): Promise<{ deed: DonationDeed; donations: DonationResponse[] }> {
		const res = await fetch('/api/donations/deeds', getFetchOptions('POST', payload));
		const data = await handleResponse<{ deed: DonationDeed; donations: DonationResponse[] }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Delete a donation by ID.
	 */
	async delete(id: string): Promise<{ success: boolean; message: string }> {
		const res = await fetch(`/api/donations/${id}`, getFetchOptions('DELETE'));
		const data = await handleResponse<{ success: boolean; message: string }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Subscribe to real-time donation changes via SSE.
	 * Returns an unsubscribe function.
	 * 
	 * Opens an SSE connection to `/api/donations/stream` and invokes
	 * `callback` whenever the server emits a `donation_change` event.
	 * 
	 * Safe to call from SSR context (no-ops when not in browser).
	 * EventSource automatically reconnects on connection loss.
	 */
	subscribeToChanges(callback: (event?: any) => void): () => void {
		// `reason` distinguishes a real change from a defensive re-read on
		// reconnect. Callers that only refetch can ignore it; callers that notify
		// the user must not fire on 'connect'.
		return subscribeToTopic('donation_change', (reason) =>
			callback({ action: reason === 'change' ? 'donation_change' : 'refresh', reason })
		);
	},

	// ─── Cache utilities ────────────────────────────────────────────────────

	peekCachedDonations(
		params: { search?: string; page?: number; limit?: number } = {}
	): DonationsListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedDonation(id: string): { donation: DonationResponse } | null {
		return getFreshCache(detailCache, id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};