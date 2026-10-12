import { subscribeToTopic } from './realtime';
import { QueryCache } from './queryCache';
import { getApiErrorMessage } from './session';

export type BorrowRequestStatus =
	| 'pending_instructor'
	| 'approved_instructor'
	| 'ready_for_pickup'
	| 'borrowed'
	| 'pending_return'
	| 'missing'
	| 'resolved'
	| 'returned'
	| 'cancelled'
	| 'rejected'
	| 'pending_appeal'
	| 'expired';

export type BorrowRequestRealtimeAction =
	| 'created'
	| 'approved'
	| 'rejected'
	| 'appealed'
	| 'released'
	| 'picked_up'
	| 'return_initiated'
	| 'returned'
	| 'missing'
	| 'cancelled'
	| 'items_inspected'
	| 'obligation_updated'
	| 'reminder_sent';

export interface BorrowRequestRealtimeEvent {
	action: BorrowRequestRealtimeAction;
	requestId: string;
	studentId: string;
	status: string;
	occurredAt: string;
}

export interface BorrowRequestItemInput {
	itemId: string;
	quantity: number;
}

export interface CreateBorrowRequestInput {
	items: BorrowRequestItemInput[];
	purpose: string;
	usageLocation?: 'school' | 'outdoor'; // Where equipment will be used
	borrowDate: string;
	returnDate: string;
	classCodeId: string; // Required: Class code selection
}

export interface BorrowRequestItem {
	itemId: string;
	name: string;
	quantity: number;
	category?: string;
	picture?: string;
	inspection?: {
		status: 'good' | 'damaged' | 'missing';
		inspectedAt: Date;
		inspectedBy: string;
		notes?: string;
		replacementQuantity?: number;
		unitPrice?: number;
		dueDate?: string;
		/** Name of the staff member who checked the item in. */
		inspectedByName?: string | null;
		/** Units by condition; together they add up to the borrowed quantity. */
		goodQuantity?: number;
		damagedQuantity?: number;
		missingQuantity?: number;
		/** Extra units handed in on top of what was borrowed. */
		overReturnedQuantity?: number;
		/** The custodian's own note on the damage or loss. */
		remarks?: string | null;
		/** Evidence photo URLs. */
		photos?: string[];
	};
}

/** One line of a return inspection as submitted by the checklist. */
export interface ItemInspectionInput {
	itemId: string;
	status: 'good' | 'damaged' | 'missing';
	notes: string;
	replacementQuantity?: number;
	dueDate?: string;
	damagedQuantity?: number;
	missingQuantity?: number;
	additionalReturned?: number;
	remarks?: string;
	photos?: string[];
}

export interface BorrowRequestUserSummary {
	id: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	profilePhotoUrl?: string;
	fullName?: string;
	yearLevel?: string;
	block?: string;
}

export interface BorrowRequestRecord {
	id: string;
	studentId: string;
	instructorId?: string;
	custodianId?: string;
	classCodeId: string; // Required: Class code for this request
	student?: BorrowRequestUserSummary;
	instructor?: BorrowRequestUserSummary;
	custodian?: BorrowRequestUserSummary;
	items: BorrowRequestItem[];
	purpose: string;
	usageLocation?: 'school' | 'outdoor'; // Where equipment will be used
	borrowDate: string;
	returnDate: string;
	status: BorrowRequestStatus;
	rejectReason?: string;
	rejectionNotes?: string;
	appealReason?: string;
	appealedAt?: string;
	appealCount?: number;
	approvedAt?: string;
	rejectedAt?: string;
	releasedAt?: string;
	pickedUpAt?: string;
	returnedAt?: string;
	expiredAt?: string;
	/** When and by whom the request was cancelled; null for older records without it. */
	cancelledAt?: string | null;
	cancelledBy?: BorrowRequestUserSummary | null;
	missingAt?: string;
	resolvedAt?: string;
	lastReminderAt?: string;
	reminderCount?: number;
	/** When the 3-day overdue disciplinary notice went out; null if it has not. */
	overdueNoticeSentAt?: string | null;
	/** Lifecycle history, oldest first. Empty on servers that predate it. */
	events?: BorrowRequestEvent[];
	createdAt: string;
	updatedAt: string;
}

export type BorrowRequestEventName =
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'appealed'
	| 'cancelled'
	| 'ready_for_pickup'
	| 'picked_up'
	| 'return_initiated'
	| 'inspected'
	| 'missing'
	| 'resolved'
	| 'expired'
	| 'reminder_sent'
	| 'overdue_notice';

/** One recorded step of a request and the person who performed it. */
export interface BorrowRequestEvent {
	event: BorrowRequestEventName;
	at: string;
	/** Null for system actions (expiry) and for history rebuilt from older records. */
	actorId: string | null;
	actorName: string | null;
	actorRole: string | null;
	notes: string | null;
	/** Inspection result: clean return or items with issues. */
	outcome: 'returned' | 'item_issue' | null;
}

/** One line of a request, measured against its booked day. */
export interface RequestAvailabilityLine {
	itemId: string;
	name: string;
	/** How many this request asks for. */
	requested: number;
	/** How many are still free that day, excluding this request. */
	free: number;
	/** Total units the school owns. */
	owned: number;
	/** Units overdue from an earlier booking — may not return in time. */
	delayed: number;
	/** Required items are always issued, stock notwithstanding. */
	isRequired: boolean;
}

export interface RequestAvailabilityResponse {
	date: string | null;
	items: RequestAvailabilityLine[];
}

export interface BorrowRequestListResponse {
	requests: BorrowRequestRecord[];
	/** Count of ALL visible requests, never just the changed ones. */
	total: number;
	page: number;
	limit: number;
	pages: number;
	/** True when `since` was honoured and `requests` holds only changes. */
	isDelta?: boolean;
	/** Server clock at read time — the watermark for the next delta. */
	syncedAt?: string;
}

interface ApiError {
	error?: string;
	message?: string;
}

interface RequestOptions {
	forceRefresh?: boolean;
}

/**
 * Marked stale by the realtime hub the moment any request changes, so entries
 * stay available for an instant repaint and are revalidated on next use.
 */
const listCache = new QueryCache<BorrowRequestListResponse>({ topics: ['borrow_request_change'] });
const detailCache = new QueryCache<BorrowRequestRecord>({ topics: ['borrow_request_change'] });

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json'
		}
	};

	if (body !== undefined) {
		options.body = JSON.stringify(body);
	}

	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;

	if (!response.ok) {
		// Use the already-parsed payload for the error message — the response
		// body has already been consumed so we cannot call response.json() again.
		const message = payload.message || payload.error || `Request failed with status ${response.status}`;

		if (response.status === 401) {
			// Trigger session expiry handling via getApiErrorMessage
			await getApiErrorMessage(response, message);
		}

		throw new Error(message);
	}

	return payload;
}

function buildListCacheKey(params: {
	status?: BorrowRequestStatus;
	statuses?: BorrowRequestStatus[];
	search?: string;
	sortBy?: 'createdAt' | 'returnDate';
	page?: number;
	limit?: number;
} = {}): string {
	const statuses = params.statuses && params.statuses.length > 0
		? [...params.statuses].sort().join(',')
		: 'none';

	return [
		params.status || 'all',
		statuses,
		params.search?.trim().toLowerCase() || 'none',
		params.sortBy || 'createdAt',
		String(params.page || 1),
		String(params.limit || 20)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.markStale();
	detailCache.markStale();
}

/** Put a record a mutation just returned straight into the detail cache. */
function rememberDetail(record: BorrowRequestRecord): void {
	detailCache.set(record.id, record);
}

/**
 * Fold a delta (rows changed since a watermark) into the cached full list, so
 * the cache follows the page instead of going stale behind it. Returns false
 * when the delta cannot be applied and the entry must be re-read in full.
 */
function mergeDeltaIntoCache(
	cacheKey: string,
	delta: BorrowRequestListResponse,
	sortBy: 'createdAt' | 'returnDate' = 'createdAt'
): boolean {
	const cached = listCache.peek(cacheKey);
	if (!cached) return false;

	// A `since` read cannot express deletion; a shrinking total is the signal.
	if (delta.total < cached.total) return false;

	const byId = new Map(cached.requests.map((record) => [record.id, record]));
	for (const record of delta.requests) {
		byId.set(record.id, record);
	}

	// Rows beyond the page size were never in this entry to begin with.
	if (byId.size !== delta.total) return false;

	// Keep the server's ordering (newest first) so a merged list reads the
	// same as a freshly fetched one.
	const stamp = (record: BorrowRequestRecord) => Date.parse(String(record[sortBy] ?? '')) || 0;
	const requests = [...byId.values()].sort((left, right) => stamp(right) - stamp(left));

	listCache.set(cacheKey, {
		...cached,
		requests,
		total: delta.total,
		syncedAt: delta.syncedAt
	});
	return true;
}

const deltaInFlight = new Map<string, Promise<BorrowRequestListResponse | null>>();

/**
 * Bring a stale cached list up to date by reading only the rows that changed
 * since it was fetched, instead of downloading the whole list again. Returns
 * null whenever that cannot be done safely, and the caller reads in full.
 */
async function revalidateWithDelta(
	cacheKey: string,
	query: URLSearchParams,
	sortBy?: 'createdAt' | 'returnDate'
): Promise<BorrowRequestListResponse | null> {
	const cached = listCache.peek(cacheKey);

	// Only a complete list can be patched: a page of a longer list would need
	// rows it never held.
	if (!cached?.syncedAt || cached.requests.length !== cached.total) return null;

	const pending = deltaInFlight.get(cacheKey);
	if (pending) return pending;

	const request = (async () => {
		try {
			const deltaQuery = new URLSearchParams(query);
			deltaQuery.set('since', cached.syncedAt as string);

			const response = await fetch(`/api/borrow-requests?${deltaQuery}`, getFetchOptions('GET'));
			const delta = await handleResponse<BorrowRequestListResponse>(response);

			// A server that ignored `since` sent everything; take it as is.
			if (!delta.isDelta) {
				listCache.set(cacheKey, delta);
				return delta;
			}

			return mergeDeltaIntoCache(cacheKey, delta, sortBy) ? listCache.peek(cacheKey) : null;
		} catch {
			return null;
		}
	})();

	deltaInFlight.set(cacheKey, request);
	try {
		return await request;
	} finally {
		deltaInFlight.delete(cacheKey);
	}
}

export const borrowRequestsAPI = {
	async list(
		params: {
			status?: BorrowRequestStatus;
			statuses?: BorrowRequestStatus[];
			search?: string;
			sortBy?: 'createdAt' | 'returnDate';
			page?: number;
			limit?: number;
			/** ISO timestamp; returns only requests touched at or after it. */
			since?: string;
		} = {},
		options: RequestOptions = {}
	): Promise<BorrowRequestListResponse> {
		const query = new URLSearchParams();
		if (params.status) query.set('status', params.status);
		if (params.statuses && params.statuses.length > 0) {
			query.set('statuses', params.statuses.join(','));
		}
		if (params.search) query.set('search', params.search);
		if (params.sortBy) query.set('sortBy', params.sortBy);
		if (params.page) query.set('page', String(params.page));
		if (params.limit) query.set('limit', String(params.limit));
		if (params.since) query.set('since', params.since);
		
		// Add cache-busting parameter when forcing refresh
		if (options.forceRefresh) {
			query.set('_t', Date.now().toString());
		}

		const url = `/api/borrow-requests${query.toString() ? `?${query.toString()}` : ''}`;
		const cacheKey = buildListCacheKey(params);

		// Deltas bypass the cache lookup — the caller merges them itself — but
		// are folded into the cached full list so it never falls behind.
		if (params.since) {
			const response = await fetch(url, getFetchOptions('GET'));
			const delta = await handleResponse<BorrowRequestListResponse>(response);
			if (!mergeDeltaIntoCache(cacheKey, delta, params.sortBy)) {
				listCache.markStale(cacheKey);
			}
			return delta;
		}

		// Stale but complete: fetch just what changed since it was read.
		if (!options.forceRefresh && listCache.getFresh(cacheKey) === null) {
			const revalidated = await revalidateWithDelta(cacheKey, query, params.sortBy);
			if (revalidated) return revalidated;
		}

		return listCache.fetch(
			cacheKey,
			async () => {
				const response = await fetch(url, getFetchOptions('GET'));
				return handleResponse<BorrowRequestListResponse>(response);
			},
			{ force: options.forceRefresh }
		);
	},

	async getById(id: string, options: RequestOptions = {}): Promise<BorrowRequestRecord> {
		return detailCache.fetch(
			id,
			async () => {
				const response = await fetch(`/api/borrow-requests/${id}`, getFetchOptions('GET'));
				return handleResponse<BorrowRequestRecord>(response);
			},
			{ force: options.forceRefresh }
		);
	},

	async create(payload: CreateBorrowRequestInput): Promise<BorrowRequestRecord> {
		// Validate required classCodeId before sending request
		if (!payload.classCodeId || payload.classCodeId.trim() === '') {
			throw new Error('Class code is required. You must be enrolled in a class to submit equipment requests.');
		}
		
		const response = await fetch('/api/borrow-requests', getFetchOptions('POST', payload));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async approve(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/approve`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async reject(id: string, reason: string, notes?: string): Promise<BorrowRequestRecord> {
		const response = await fetch(
			`/api/borrow-requests/${id}/reject`,
			getFetchOptions('POST', { reason, notes })
		);
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async cancel(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}`, getFetchOptions('DELETE'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async appeal(id: string, reason: string): Promise<BorrowRequestRecord> {
		const response = await fetch(
			`/api/borrow-requests/${id}/appeal`,
			getFetchOptions('POST', { reason })
		);
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	/**
	 * Per-item availability on this request's booked day. Lets an approver see
	 * what approving would commit before they commit it.
	 */
	async availability(id: string): Promise<RequestAvailabilityResponse> {
		const response = await fetch(
			`/api/borrow-requests/${id}/availability`,
			getFetchOptions('GET')
		);
		return handleResponse<RequestAvailabilityResponse>(response);
	},

	async release(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/release`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async pickup(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/pickup`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async markReturned(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/return`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async markMissing(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/missing`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		rememberDetail(data);
		return data;
	},

	async sendOverdueReminder(id: string): Promise<{ success: boolean; message: string; reminderCount: number }> {
		const response = await fetch(`/api/borrow-requests/${id}/send-reminder`, getFetchOptions('POST'));
		const data = await handleResponse<{ success: boolean; message: string; reminderCount: number }>(response);
		invalidateAllCaches();
		return data;
	},


	/**
	 * Inspect items during return process
	 * Creates replacement obligations for damaged/missing items
	 */
	async inspectItems(
		id: string,
		items: Array<Omit<ItemInspectionInput, 'notes'> & { notes?: string }>
	): Promise<{ success: boolean; message: string; status: BorrowRequestStatus; obligationsCreated: number }> {
		const response = await fetch(`/api/borrow-requests/${id}/inspect-items`, getFetchOptions('POST', { items }));
		const data = await handleResponse<{
			success: boolean;
			message: string;
			status: BorrowRequestStatus;
			obligationsCreated: number;
		}>(response);
		
		invalidateAllCaches();
		return data;
	},

	peekCachedList(params: {
		status?: BorrowRequestStatus;
		statuses?: BorrowRequestStatus[];
		search?: string;
		sortBy?: 'createdAt' | 'returnDate';
		page?: number;
		limit?: number;
	} = {}): BorrowRequestListResponse | null {
		return listCache.peek(buildListCacheKey(params));
	},

	/** Whether the cached list for these params is known to be current. */
	isCachedListFresh(params: {
		status?: BorrowRequestStatus;
		statuses?: BorrowRequestStatus[];
		search?: string;
		sortBy?: 'createdAt' | 'returnDate';
		page?: number;
		limit?: number;
	} = {}): boolean {
		return listCache.isFresh(buildListCacheKey(params));
	},

	peekCachedDetail(id: string): BorrowRequestRecord | null {
		return detailCache.peek(id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	},

	/**
	 * Open an SSE connection to `/api/borrow-requests/stream` and invoke
	 * `callback` whenever the server emits a `borrow_request_change` event.
	 *
	 * Returns an unsubscribe function — call it in `onDestroy` / cleanup.
	 * Safe to call from SSR context (no-ops when not in browser).
	 */
	subscribeToChanges(callback: (event: BorrowRequestRealtimeEvent) => void): () => void {
		// Delegates to the shared realtime hub: one multiplexed connection for
		// the whole page rather than one stream per domain. The callback also
		// fires on every (re)connect, so a gap cannot leave stale data on screen.
		return subscribeToTopic('borrow_request_change', () =>
			callback({
				action: 'created',
				requestId: '',
				studentId: '',
				status: '',
				occurredAt: new Date().toISOString()
			})
		);
	}
};
