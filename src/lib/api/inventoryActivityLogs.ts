import { subscribeToTopic } from './realtime';
import { QueryCache } from './queryCache';
import { getApiErrorMessage } from './session';

/**
 * Inventory activity log entry
 */
export interface InventoryActivityLogEntry {
	id: string;
	action: string;
	entityType: 'item' | 'category';
	entityId: string;
	entityName: string;
	userId: string;
	userName: string;
	userRole: string;
	userProfilePhotoUrl?: string;
	changes?: {
		field: string;
		oldValue: any;
		newValue: any;
	}[];
	metadata?: Record<string, any>;
	ipAddress?: string;
	timestamp: Date;
}

/**
 * Deleted item or category
 */
export interface DeletedItem {
	id: string;
	originalId: string;
	type: 'item' | 'category';
	itemData?: any;
	categoryData?: any;
	deletedBy: string;
	deletedByName: string;
	deletedByRole: string;
	deletedAt: Date;
	scheduledDeletion: Date;
	daysRemaining: number;
	reason?: string;
}

/**
 * Fetch helper with automatic cookie credentials
 */
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

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'An error occurred' }));
		throw new Error(
			await getApiErrorMessage(response, error.error || `Request failed with status ${response.status}`)
		);
	}
	return response.json();
}

const inFlight = new Map<string, Promise<any>>();

// Entries are kept until the realtime hub reports a change, then revalidated
// on next use; requests already in flight when it changes are not reused.
// The log gains a row for stock edits and for stock moved by requests.
const activityLogsCache = new QueryCache<any>({
	topics: ['inventory_change', 'borrow_request_change'],
	onStale: () => inFlight.clear()
});

function getFreshCache<T>(cache: QueryCache<T>, key: string): T | null {
	return cache.getFresh(key);
}

function setCache<T>(cache: QueryCache<T>, key: string, data: T): void {
	cache.set(key, data);
}

/**
 * Inventory Activity Logs API
 */
export const inventoryActivityLogsAPI = {
	peekCachedLogs(params?: {
		action?: string;
		entityType?: 'item' | 'category';
		entityId?: string;
		userId?: string;
		startDate?: string;
		endDate?: string;
		page?: number;
		limit?: number;
	}): { activityLogs: InventoryActivityLogEntry[]; total: number; page: number; limit: number; pages: number } | null {
		const key = JSON.stringify(params || {});
		return activityLogsCache.peek(key);
	},

	invalidateCache() {
		activityLogsCache.markStale();
	},

	/**
	 * Get activity logs (audit trail)
	 */
	async getActivityLogs(params?: {
		action?: string;
		entityType?: 'item' | 'category';
		entityId?: string;
		userId?: string;
		startDate?: string;
		endDate?: string;
		page?: number;
		limit?: number;
		forceRefresh?: boolean;
	}): Promise<{ activityLogs: InventoryActivityLogEntry[]; total: number; page: number; limit: number; pages: number }> {
		const queryParams = new URLSearchParams();
		if (params?.action) queryParams.set('action', params.action);
		if (params?.entityType) queryParams.set('entityType', params.entityType);
		if (params?.entityId) queryParams.set('entityId', params.entityId);
		if (params?.userId) queryParams.set('userId', params.userId);
		if (params?.startDate) queryParams.set('startDate', params.startDate);
		if (params?.endDate) queryParams.set('endDate', params.endDate);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());
		if (params?.forceRefresh) queryParams.set('_t', Date.now().toString());

		const query = queryParams.toString();
		const url = `/api/inventory/activity-logs${query ? `?${query}` : ''}`;

		const cacheKey = JSON.stringify({
			action: params?.action,
			entityType: params?.entityType,
			entityId: params?.entityId,
			userId: params?.userId,
			startDate: params?.startDate,
			endDate: params?.endDate,
			page: params?.page,
			limit: params?.limit
		});

		if (!params?.forceRefresh) {
			const cached = getFreshCache<{ activityLogs: InventoryActivityLogEntry[]; total: number; page: number; limit: number; pages: number }>(activityLogsCache, cacheKey);
			if (cached) return cached;
			const existing = inFlight.get(cacheKey);
			if (existing) return existing;
		}

		const req = (async () => {
			const response = await fetch(url, getFetchOptions('GET'));
			const result = await handleResponse<{ activityLogs: InventoryActivityLogEntry[]; total: number; page: number; limit: number; pages: number }>(response);
			setCache(activityLogsCache, cacheKey, result);
			return result;
		})();

		inFlight.set(cacheKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(cacheKey);
		}
	},

	/**
	 * Subscribe to real-time inventory changes via SSE
	 * Returns an unsubscribe function to clean up the connection
	 */
	subscribeToChanges(callback: (event: any) => void): () => void {
		return subscribeToTopic('inventory_change', () => callback({ action: 'refresh' }));
	}
};

/**
 * Archived Items API
 */
export const archivedItemsAPI = {
	/**
	 * Get all archived items
	 */
	async getArchived(params?: {
		search?: string;
		category?: string;
		page?: number;
		limit?: number;
		forceRefresh?: boolean;
	}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
		const queryParams = new URLSearchParams();
		if (params?.search) queryParams.set('search', params.search);
		if (params?.category) queryParams.set('category', params.category);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());
		if (params?.forceRefresh) queryParams.set('_t', Date.now().toString());

		const query = queryParams.toString();
		const url = `/api/inventory/archived${query ? `?${query}` : ''}`;

		const response = await fetch(url, getFetchOptions('GET'));
		return handleResponse(response);
	},

	/**
	 * Restore an archived item
	 */
	async restore(itemId: string): Promise<{ success: boolean; message: string }> {
		const response = await fetch('/api/inventory/archived', getFetchOptions('POST', { itemId }));
		return handleResponse(response);
	}
};

/**
 * Deleted Items API
 */
export const deletedItemsAPI = {
	/**
	 * Get recently deleted items
	 */
	async getDeleted(params?: {
		search?: string;
		page?: number;
		limit?: number;
		forceRefresh?: boolean;
	}): Promise<{ items: DeletedItem[]; total: number; page: number; limit: number; pages: number }> {
		const queryParams = new URLSearchParams();
		if (params?.search) queryParams.set('search', params.search);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());
		if (params?.forceRefresh) queryParams.set('_t', Date.now().toString());

		const query = queryParams.toString();
		const url = `/api/inventory/deleted${query ? `?${query}` : ''}`;

		const response = await fetch(url, getFetchOptions('GET'));
		return handleResponse(response);
	},

	/**
	 * Restore a deleted item or category
	 */
	async restore(deletedId: string, type: 'item' | 'category'): Promise<{ success: boolean; message: string }> {
		const response = await fetch('/api/inventory/deleted', getFetchOptions('POST', { deletedId, type }));
		return handleResponse(response);
	},

	/**
	 * Permanently delete an item or category (superadmin only)
	 */
	async permanentlyDelete(deletedId: string, type: 'item' | 'category'): Promise<{ success: boolean; message: string }> {
		const response = await fetch('/api/inventory/deleted', getFetchOptions('DELETE', { deletedId, type }));
		return handleResponse(response);
	},

	invalidateCache(): void {
		activityLogsCache.markStale();
	}
};
