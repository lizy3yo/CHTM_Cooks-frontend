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
	| 'borrow_request_expired'
	| 'borrow_request_appealed'
	| 'borrow_request_reminder'
	| 'borrow_request_overdue_notice'
	| 'support_message_received';

export interface NotificationRecord {
	id: string;
	userId: string;
	audienceRole: 'student' | 'instructor' | 'custodian' | 'admin' | 'superadmin';
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

import { getApiErrorMessage } from './session';
import { subscribeToTopic } from './realtime';
import { QueryCache } from './queryCache';

interface ApiError {
	error?: string;
	message?: string;
}

interface RequestOptions {
	forceRefresh?: boolean;
}

// Marked stale by the realtime hub whenever this user's notifications change.
const listCache = new QueryCache<NotificationListResponse>({ topics: ['notification_change'] });

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

function invalidateListCache(): void {
	listCache.markStale();
}

export const notificationsAPI = {
	async list(limit = 25, skip = 0, options: RequestOptions = {}): Promise<NotificationListResponse> {
		const query = new URLSearchParams({ limit: String(limit), skip: String(skip) });
		if (options.forceRefresh) {
			query.set('_t', Date.now().toString());
			// Other page sizes (the full notifications page) are stale too.
			invalidateListCache();
		}

		return listCache.fetch(
			buildListCacheKey(limit, skip),
			async () => {
				const response = await fetch(`/api/notifications?${query.toString()}`, {
					credentials: 'include'
				});
				return handleResponse<NotificationListResponse>(response);
			},
			{ force: options.forceRefresh }
		);
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
		return listCache.peek(buildListCacheKey(limit, skip));
	},

	invalidateCache(): void {
		invalidateListCache();
	}
};

/**
 * Run `onChange` whenever this user's notifications may have changed on the
 * server. That includes reconnects: a notification that arrives while the
 * stream is down is never announced, and re-reading five rows is cheap.
 * Returns an unsubscribe function.
 */
export function watchNotifications(onChange: () => void): () => void {
	return subscribeToTopic('notification_change', () => onChange());
}
