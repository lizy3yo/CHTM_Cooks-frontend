import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

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

/**
 * Kept only so a revisit paints instantly; callers always revalidate in the
 * background, so this never decides what the user ultimately sees.
 */
let lastSnapshot: OperationsOverview | null = null;
let inFlight: Promise<OperationsOverview> | null = null;

export function peekCachedOperationsOverview(): OperationsOverview | null {
	return browser ? lastSnapshot : null;
}

export async function fetchOperationsOverview(): Promise<OperationsOverview> {
	// Collapse bursts (e.g. several realtime events at once) into one request.
	if (inFlight) return inFlight;

	inFlight = (async () => {
		const res = await fetch('/api/dashboard/operations', {
			credentials: 'include',
			cache: 'no-store'
		});
		const body = (await res.json().catch(() => ({}))) as OperationsOverview & { error?: string };
		if (!res.ok) {
			throw new Error(await getApiErrorMessage(res, body.error ?? `Request failed: ${res.status}`));
		}
		lastSnapshot = body;
		return body;
	})();

	try {
		return await inFlight;
	} finally {
		inFlight = null;
	}
}
