import { getApiErrorMessage } from './session';
import { QueryCache } from './queryCache';

/**
 * Live operational snapshot for staff dashboards — `GET /api/dashboard/operations`.
 *
 * Every figure is the state of the storeroom right now (not scoped to a
 * reporting period), so it always agrees with the requests pages.
 */

export interface OperationsQueueItem {
	id: string;
	status: string;
	studentId: string;
	studentName: string | null;
	studentPhotoUrl: string | null;
	instructorName: string | null;
	itemCount: number;
	borrowDate: string | null;
	returnDate: string | null;
	createdAt: string | null;
	isOverdue: boolean;
}

export interface OperationsOverview {
	pipeline: {
		underReview: number;
		appeals: number;
		approved: number;
		readyForPickup: number;
		borrowed: number;
		pendingReturn: number;
		unresolved: number;
		overdue: number;
	};
	itemsOut: number;
	replacementsPending: number;
	queues: {
		underReview: OperationsQueueItem[];
		approved: OperationsQueueItem[];
		readyForPickup: OperationsQueueItem[];
		borrowed: OperationsQueueItem[];
	};
	generatedAt: string;
}

const SNAPSHOT_KEY = 'overview';

/**
 * A revisit paints from this instantly. The realtime hub marks it stale the
 * moment a request or replacement case changes; "overdue" also moves with the
 * clock alone, so it is never trusted for more than a minute regardless.
 */
const snapshotCache = new QueryCache<OperationsOverview>({
	topics: ['borrow_request_change', 'replacement_obligation_change'],
	staleAfterMs: 60_000
});

export function peekCachedOperationsOverview(): OperationsOverview | null {
	return snapshotCache.peek(SNAPSHOT_KEY);
}

export async function fetchOperationsOverview(
	options: { forceRefresh?: boolean } = {}
): Promise<OperationsOverview> {
	// Concurrent callers (e.g. several realtime events at once) share one request.
	return snapshotCache.fetch(
		SNAPSHOT_KEY,
		async () => {
			const res = await fetch('/api/dashboard/operations', {
				credentials: 'include',
				cache: 'no-store'
			});
			const body = (await res.json().catch(() => ({}))) as OperationsOverview & { error?: string };
			if (!res.ok) {
				throw new Error(await getApiErrorMessage(res, body.error ?? `Request failed: ${res.status}`));
			}
			return body;
		},
		{ force: options.forceRefresh }
	);
}
