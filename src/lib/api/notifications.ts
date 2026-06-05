export type NotificationType =
	| 'borrow_request_submitted'
	| 'borrow_request_pending_review'
	| 'borrow_request_approved'
	| 'borrow_request_rejected'
	| 'borrow_request_ready_for_pickup'
	| 'borrow_request_picked_up'
	| 'borrow_request_return_initiated'
	| 'borrow_request_returned'
	| 'borrow_request_missing'
	| 'borrow_request_item_issue'
	| 'borrow_request_cancelled'
	| 'borrow_request_reminder'
	| 'support_message_received';

export interface NotificationRecord {
	id: string;
	userId: string;
	audienceRole: 'student' | 'instructor' | 'custodian' | 'superadmin';
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	borrowRequestId?: string;
	metadata?: Record<string, unknown>;
	isRead: boolean;
	readAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface NotificationListResponse {
	notifications: NotificationRecord[];
	unreadCount: number;
}

import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

interface ApiError {
	error?: string;
	message?: string;
}

interface RequestOptions {
	forceRefresh?: boolean;
}

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const listCache = new Map<string, CacheEntry<NotificationListResponse>>();

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		throw new Error(
			await getApiErrorMessage(response, payload.message || payload.error || `Request failed with status ${response.status}`)
		);
	}
	return payload;
}

function buildListCacheKey(limit: number, skip: number): string {
	return `${limit}:${skip}`;
}

function getFreshListCache(limit: number, skip: number): NotificationListResponse | null {
	if (!browser) return null;

	const entry = listCache.get(buildListCacheKey(limit, skip));
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		listCache.delete(buildListCacheKey(limit, skip));
		return null;
	}

	return entry.data;
}

function setListCache(limit: number, skip: number, data: NotificationListResponse): void {
	if (!browser) return;

	listCache.set(buildListCacheKey(limit, skip), {
		data,
		expiresAt: Date.now() + CLIENT_CACHE_TTL_MS
	});
}

function invalidateListCache(): void {
	listCache.clear();
}

export const notificationsAPI = {
	async list(limit = 25, skip = 0, options: RequestOptions = {}): Promise<NotificationListResponse> {
		if (!options.forceRefresh) {
			const cached = getFreshListCache(limit, skip);
			if (cached) return cached;
		}

		const query = new URLSearchParams({ limit: String(limit), skip: String(skip) });
		if (options.forceRefresh) {
			query.set('_t', Date.now().toString());
		}
		const response = await fetch(`/api/notifications?${query.toString()}`, {
			credentials: 'include'
		});
		const data = await handleResponse<NotificationListResponse>(response);
		setListCache(limit, skip, data);
		return data;
	},

	async markAsRead(id: string): Promise<void> {
		const response = await fetch(`/api/notifications/${id}/read`, {
			method: 'POST',
			credentials: 'include'
		});
		await handleResponse<{ success: boolean }>(response);
		invalidateListCache();
	},

	async markAllAsRead(): Promise<number> {
		const response = await fetch('/api/notifications', {
			method: 'PATCH',
			credentials: 'include'
		});
		const payload = await handleResponse<{ success: boolean; markedCount: number }>(response);
		invalidateListCache();
		return payload.markedCount;
	},

	peekCachedList(limit = 25, skip = 0): NotificationListResponse | null {
		return getFreshListCache(limit, skip);
	},

	invalidateCache(): void {
		invalidateListCache();
	}
};
