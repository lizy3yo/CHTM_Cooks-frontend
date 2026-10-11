import { getApiErrorMessage } from './session';

/**
 * Inventory reports for Reports & Analytics: the Over / Under variance and
 * the record of what came back from each loan.
 */

/** Where stock gained during the month came from. */
export type OverSource = 'donation' | 'replacement_surplus' | 'over_return' | 'adjustment';

/** Why a unit is not on the shelf. */
export type UnderKind = 'unreturned' | 'damaged' | 'missing' | 'adjustment';

export interface VarianceOverEntry {
	id: string;
	source: OverSource;
	itemId: string | null;
	itemName: string;
	category: string | null;
	quantity: number;
	date: string;
	/** The donor, the borrower who gave extra, or the custodian who adjusted. */
	person: string | null;
	/** Donation receipt or request code. */
	reference: string | null;
	reason: string | null;
	unitCost?: number | null;
	deedStatus?: 'pending' | 'signed' | null;
}

export interface VarianceUnderEntry {
	id: string;
	kind: UnderKind;
	itemId: string | null;
	itemName: string;
	category: string | null;
	quantity: number;
	date: string;
	/** The borrower who has or owes the units, or the custodian who adjusted. */
	person: string | null;
	reference: string | null;
	requestId?: string | null;
	reason: string | null;
	/** True while the units can still come back; false for a stock adjustment. */
	open: boolean;
	daysOutstanding: number;
	daysOverdue?: number;
	dueDate: string | null;
	/** Month the shortage began, when it started before this one. */
	carriedFrom: string | null;
	/** The 3-day disciplinary notice has gone out. */
	noticeSent: boolean;
}

export interface VarianceUnexplained {
	itemId: string;
	itemName: string;
	category: string | null;
	/** Positive: more than the records explain. Negative: fewer. */
	difference: number;
	expected: number;
	actual: number;
}

export interface InventoryVarianceReport {
	month: string;
	monthLabel: string;
	isCurrentMonth: boolean;
	summary: {
		/** Total starting count for the month; null before the first closing. */
		startingCount: number | null;
		startedAt: string | null;
		isRestart: boolean;
		overUnits: number;
		overEntries: number;
		underUnits: number;
		underOpenUnits: number;
		underEntries: number;
	};
	over: VarianceOverEntry[];
	under: VarianceUnderEntry[];
	unexplained: VarianceUnexplained[];
	/** Present once the month has been closed. */
	closing: {
		closedAt: string;
		overAbsorbed: number;
		writtenOff: number;
		underCarried: number;
		closingTotal: number;
	} | null;
}

export interface ReturnedItemRow {
	id: string;
	requestId: string;
	requestCode: string;
	studentId: string | null;
	studentName: string;
	itemName: string;
	category: string | null;
	quantity: number;
	good: number;
	damaged: number;
	missing: number;
	over: number;
	condition: 'good' | 'damaged' | 'missing';
	pickedUpAt: string | null;
	dueDate: string | null;
	returnedAt: string | null;
	inspectedAt: string | null;
	daysKept: number | null;
	daysLate: number;
	inspectedBy: string | null;
	remarks: string | null;
	photos: string[];
	replacementDue: string | null;
}

export interface ReturnedItemsReport {
	from: string;
	to: string;
	summary: {
		lines: number;
		requests: number;
		borrowed: number;
		good: number;
		damaged: number;
		missing: number;
		over: number;
		lateRequests: number;
		onTimeRequests: number;
		avgDaysKept: number | null;
	};
	rows: ReturnedItemRow[];
}

export interface ReturnedItemsQuery {
	/** yyyy-mm-dd; omit both for the current month. */
	from?: string;
	to?: string;
	classCodeIds?: string[];
	studentIds?: string[];
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
	const body = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) {
		throw new Error(await getApiErrorMessage(res, body.error ?? `Request failed: ${res.status}`));
	}
	return body;
}

export const inventoryReportsAPI = {
	/** @param month yyyy-mm; defaults to the current month. */
	variance(month?: string): Promise<InventoryVarianceReport> {
		return getJson(`/api/reports/inventory-variance${month ? `?month=${encodeURIComponent(month)}` : ''}`);
	},

	returnedItems(query: ReturnedItemsQuery = {}): Promise<ReturnedItemsReport> {
		const p = new URLSearchParams();
		if (query.from) p.set('from', query.from);
		if (query.to) p.set('to', query.to);
		// Bracket keys: plain repeated keys collapse to the last value in PHP.
		for (const id of query.classCodeIds ?? []) p.append('class_code_id[]', id);
		for (const id of query.studentIds ?? []) p.append('student_id[]', id);
		const s = p.toString();
		return getJson(`/api/reports/returned-items${s ? `?${s}` : ''}`);
	}
};
