/**
 * What the details window shows for each kind of figure in Reports &
 * Analytics. Each function turns report data the screen already holds into a
 * `ReportDetail`; nothing here fetches.
 */
import type {
	BorrowedItemEntry,
	DonationRecord,
	ItemBorrowed,
	OverdueRequest,
	StockAdjustmentEntry,
	StudentRiskEntry,
	WalkInReportTransaction
} from '$lib/api/analyticsReports';
import type { ReturnedItemRow, VarianceOverEntry, VarianceUnderEntry } from '$lib/api/inventoryReports';
import {
	detailDate,
	detailPeso,
	requestCode,
	statusBadge,
	type DetailRow,
	type DetailTone,
	type ReportDetail
} from './reportDetail.svelte';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ── Inventory variance ──────────────────────────────────────────────────────

const OVER_SOURCE: Record<VarianceOverEntry['source'], string> = {
	donation: 'Donation',
	replacement_surplus: 'Extra units from a replacement',
	over_return: 'Extra units returned',
	adjustment: 'Stock adjustment'
};

export function overEntryDetail(e: VarianceOverEntry, monthLabel: string): ReportDetail {
	return {
		title: e.itemName,
		subtitle: e.category ?? 'Uncategorized',
		picture: e.picture ?? null,
		badge: { label: OVER_SOURCE[e.source], tone: e.source === 'donation' ? 'info' : 'neutral' },
		stat: { label: `Units gained in ${monthLabel}`, value: `+${e.quantity}`, tone: 'good' },
		fields: [
			{ label: e.source === 'donation' ? 'Donor' : e.source === 'adjustment' ? 'Added by' : 'Borrower', value: e.person },
			{ label: 'Date', value: detailDate(e.date) },
			{ label: e.source === 'donation' ? 'Receipt' : 'Reference', value: e.reference },
			...(e.source === 'donation'
				? [
						{ label: 'Value each', value: detailPeso(e.unitCost) },
						{ label: 'Total value', value: e.unitCost != null ? detailPeso(e.unitCost * e.quantity) : '—' },
						{ label: 'Deed of donation', value: e.deedStatus === 'signed' ? 'Signed' : 'Pending signature' }
					]
				: [])
		],
		note: e.reason ? { label: e.source === 'donation' ? 'Purpose' : 'Reason', text: e.reason } : undefined
	};
}

export function underEntryDetail(e: VarianceUnderEntry): ReportDetail {
	const label =
		e.kind === 'unreturned'
			? e.daysOverdue
				? 'Unreturned, overdue'
				: 'Out on loan'
			: e.kind === 'adjustment'
				? 'Removed by stock adjustment'
				: e.kind === 'damaged'
					? 'Damaged, awaiting replacement'
					: 'Missing, awaiting replacement';
	const tone: DetailTone = e.kind === 'adjustment' ? 'neutral' : e.kind === 'damaged' ? 'warn' : 'bad';

	return {
		title: e.itemName,
		subtitle: e.category ?? 'Uncategorized',
		picture: e.picture ?? null,
		badge: { label, tone },
		stat: { label: 'Units not on the shelf', value: `−${e.quantity}`, tone: 'bad' },
		fields: [
			{ label: e.kind === 'adjustment' ? 'Removed by' : 'Responsible', value: e.person },
			{ label: 'Request', value: e.reference },
			{ label: e.kind === 'adjustment' ? 'Date' : 'Since', value: detailDate(e.date) },
			...(e.kind === 'adjustment'
				? []
				: [
						{ label: e.kind === 'unreturned' ? 'Due back' : 'Replacement due', value: detailDate(e.dueDate) },
						{ label: 'Days outstanding', value: plural(e.daysOutstanding, 'day') },
						{ label: 'Days overdue', value: e.daysOverdue ? plural(e.daysOverdue, 'day') : 'Not overdue' },
						{ label: 'Disciplinary notice', value: e.noticeSent ? 'Sent' : 'Not sent' },
						{ label: 'Carried from', value: e.carriedFrom ?? 'This month' }
					])
		],
		note: e.reason ? { label: e.kind === 'adjustment' ? 'Reason' : 'Notes', text: e.reason } : undefined
	};
}

// ── Stock adjustments and donations ─────────────────────────────────────────

const GENERIC_REASONS = ['Manual Stock Restock', 'Manual Stock Damage/Loss', 'Restock', 'Damage/Loss'];

export function stockAdjustmentDetail(a: StockAdjustmentEntry): ReportDetail {
	const added = a.quantity > 0;
	const reason = a.purpose && !GENERIC_REASONS.includes(a.purpose) ? a.purpose : added ? 'Manual restock' : 'Damage / loss';

	return {
		title: a.itemName,
		subtitle: 'Stock adjustment',
		picture: a.picture ?? null,
		badge: { label: added ? 'Restock' : 'Loss / Damage', tone: added ? 'good' : 'bad' },
		stat: { label: 'Change in stock', value: `${added ? '+' : ''}${a.quantity}`, tone: added ? 'good' : 'bad' },
		fields: [
			{ label: 'Count before', value: a.countBefore },
			{ label: 'Count after', value: a.countAfter },
			{ label: 'Adjusted by', value: a.adjustedBy },
			{ label: 'Role', value: a.adjustedByRole ? a.adjustedByRole.replace(/^\w/, (c) => c.toUpperCase()) : null },
			{ label: 'Date', value: detailDate(a.createdAt ?? a.date, true) }
		],
		note: { label: 'Reason', text: a.notes ? `${reason}\n${a.notes}` : reason }
	};
}

/** The whole deed a donation line belongs to, with every item given under it. */
export function donationDetail(d: DonationRecord, all: DonationRecord[]): ReportDetail {
	const lines = d.deed ? all.filter((other) => other.deed?.id === d.deed?.id) : [d];
	const total = lines.reduce((sum, line) => sum + (line.totalValue ?? 0), 0);
	const receiptOnly = !d.inventoryItemId && !!d.deed?.orNumber;

	return {
		title: d.deed?.representativeName ?? d.donorName,
		subtitle: d.deed ? `Deed of donation ${d.deed.reference}` : `Donation ${d.receiptNumber}`,
		badge: { label: d.deedStatus === 'signed' ? 'Deed signed' : 'Deed pending signature', tone: d.deedStatus === 'signed' ? 'good' : 'warn' },
		stat: { label: 'Total donated value', value: detailPeso(total || d.deed?.declaredTotal || null), tone: 'good' },
		fields: [
			{ label: 'Program', value: d.deed?.program },
			{ label: 'Date donated', value: detailDate(d.deed?.dateDonated ?? d.date ?? d.createdAt) },
			{ label: 'Submitted by', value: d.deed?.submitterEmail },
			{ label: 'OR number', value: d.deed?.orNumber },
			{ label: 'Total written on the deed', value: detailPeso(d.deed?.declaredTotal) },
			{ label: 'Recorded by', value: d.recordedBy }
		],
		note: d.deed?.notes || d.notes ? { label: 'Notes', text: (d.deed?.notes || d.notes) as string } : undefined,
		files: (d.deed?.files ?? []).map((url, i, files) => ({ label: files.length > 1 ? `Signed deed ${i + 1}` : 'Signed deed', url })),
		sections: [
			{
				title: receiptOnly ? 'Recorded amount' : 'Donated items',
				rows: lines.map((line) => ({
					// A receipt-only line is an amount, not an item, so it has no photo.
					...(line.inventoryItemId ? { picture: line.picture ?? null } : {}),
					title: line.itemName,
					subtitle: line.inventoryItemId
						? `${line.quantity} ${line.unit || (line.quantity === 1 ? 'unit' : 'units')} · ${detailPeso(line.unitCost)} each`
						: 'Nothing added to stock',
					meta: line.receiptNumber,
					right: detailPeso(line.totalValue)
				}))
			}
		]
	};
}

// ── Returned items and walk-ins ─────────────────────────────────────────────

const CONDITION: Record<ReturnedItemRow['condition'], { label: string; tone: DetailTone }> = {
	good: { label: 'Good', tone: 'good' },
	damaged: { label: 'Damaged', tone: 'warn' },
	missing: { label: 'Missing', tone: 'bad' }
};

/** One returned line, with the other items that came back on the same request. */
export function returnedItemDetail(row: ReturnedItemRow, all: ReturnedItemRow[]): ReportDetail {
	const others = all.filter((other) => other.requestId === row.requestId && other.id !== row.id);

	return {
		title: row.itemName,
		subtitle: `${row.category ?? 'Uncategorized'} · ${row.requestCode}`,
		picture: row.picture ?? null,
		badge: CONDITION[row.condition] ?? CONDITION.good,
		stat: { label: 'Units borrowed', value: String(row.quantity) },
		fields: [
			{ label: 'Borrower', value: row.studentName },
			{ label: 'Returned in good condition', value: row.good },
			{ label: 'Damaged', value: row.damaged },
			{ label: 'Missing', value: row.missing },
			{ label: 'Extra units returned', value: row.over },
			{ label: 'Picked up', value: detailDate(row.pickedUpAt, true) },
			{ label: 'Due back', value: detailDate(row.dueDate, true) },
			{ label: 'Returned', value: detailDate(row.returnedAt, true) },
			{ label: 'Days kept', value: row.daysKept === null ? null : plural(row.daysKept, 'day') },
			{ label: 'Lateness', value: row.daysLate > 0 ? `${plural(row.daysLate, 'day')} late` : 'On time' },
			{ label: 'Inspected by', value: row.inspectedBy },
			{ label: 'Replacement due', value: row.replacementDue ? detailDate(row.replacementDue) : null }
		],
		note: row.remarks ? { label: 'Inspection remarks', text: row.remarks } : undefined,
		photos: row.photos ?? [],
		sections: others.length
			? [
					{
						title: 'Also on this request',
						rows: others.map((other) => ({
							picture: other.picture ?? null,
							title: other.itemName,
							subtitle: other.category ?? 'Uncategorized',
							right: `×${other.quantity}`,
							badge: CONDITION[other.condition] ?? CONDITION.good
						}))
					}
				]
			: []
	};
}

export function walkInDetail(t: WalkInReportTransaction): ReportDetail {
	const status: Record<string, { label: string; tone: DetailTone }> = {
		borrowed: { label: 'Borrowed', tone: 'info' },
		returned: { label: 'Returned', tone: 'good' },
		missing: { label: 'Item issue', tone: 'bad' }
	};

	return {
		title: t.studentName,
		subtitle: `Walk-in ${t.id}`,
		badge: status[t.status] ?? { label: t.status, tone: 'neutral' },
		stat: { label: 'Units borrowed', value: String(t.items.reduce((sum, item) => sum + item.quantity, 0)) },
		fields: [
			{ label: 'Email', value: t.email },
			{ label: 'Class', value: t.classCode },
			{ label: 'Where it was used', value: t.usageLocation === 'outdoor' ? 'Outside the school' : 'In school' },
			{ label: 'Borrowed', value: detailDate(t.borrowDate, true) },
			{ label: 'Due back', value: detailDate(t.returnDate, true) },
			{ label: 'Returned', value: t.returnedAt ? detailDate(t.returnedAt, true) : 'Not yet' }
		],
		note: t.purpose || t.notes ? { label: 'Purpose', text: [t.purpose, t.notes].filter(Boolean).join('\n') } : undefined,
		sections: [
			{
				title: 'Items',
				rows: t.items.map((item) => ({
					picture: item.picture ?? null,
					title: item.name,
					subtitle: item.category || 'Uncategorized',
					right: `×${item.quantity}`,
					...(item.inspectionStatus && CONDITION[item.inspectionStatus as ReturnedItemRow['condition']]
						? { badge: CONDITION[item.inspectionStatus as ReturnedItemRow['condition']] }
						: {})
				}))
			}
		]
	};
}

// ── Borrowing ───────────────────────────────────────────────────────────────

const entryRow = (e: BorrowedItemEntry): DetailRow => ({
	picture: e.picture ?? null,
	title: e.name,
	subtitle: `${e.studentName} · ${requestCode(e.requestId)}`,
	meta: `Requested ${detailDate(e.requestDate)}${e.borrowDate ? ` · borrowed ${detailDate(e.borrowDate)}` : ''}`,
	right: `×${e.quantity}`,
	badge: statusBadge(e.requestStatus)
});

/** Everyone who borrowed one item in the period. */
export function borrowedItemDetail(item: ItemBorrowed, entries: BorrowedItemEntry[]): ReportDetail {
	const lines = entries.filter((e) => (e.itemId ? e.itemId === item.id : e.name === item.name));

	return {
		title: item.name,
		subtitle: item.category || 'Uncategorized',
		picture: item.picture ?? lines[0]?.picture ?? null,
		stat: { label: 'Units borrowed in this period', value: String(item.totalQuantity) },
		fields: [
			{ label: 'Times requested', value: item.borrowCount },
			{ label: 'Borrowers', value: new Set(lines.map((e) => e.studentEmail)).size || null }
		],
		sections: [
			{
				title: 'Who borrowed it',
				empty: 'The list of borrowers is still loading. Try again in a moment.',
				rows: lines.map((e) => ({
					title: e.studentName,
					subtitle: `${requestCode(e.requestId)} · ${detailDate(e.borrowDate ?? e.requestDate)}`,
					right: `×${e.quantity}`,
					badge: statusBadge(e.requestStatus)
				}))
			}
		]
	};
}

/**
 * The requests behind a number: every request line in the period that passes
 * `keep`, listed item by item.
 */
export function requestsDetail(
	title: string,
	subtitle: string,
	entries: BorrowedItemEntry[],
	keep: (e: BorrowedItemEntry) => boolean = () => true,
	badge?: { label: string; tone: DetailTone }
): ReportDetail {
	const lines = entries.filter(keep);
	const requests = new Set(lines.map((e) => e.requestId)).size;

	return {
		title,
		subtitle,
		badge,
		stat: { label: 'Requests', value: String(requests) },
		fields: [
			{ label: 'Item lines', value: lines.length },
			{ label: 'Units', value: lines.reduce((sum, e) => sum + e.quantity, 0) },
			{ label: 'Students', value: new Set(lines.map((e) => e.studentEmail)).size }
		],
		sections: [
			{
				title: 'Requested items',
				empty: entries.length ? 'No requests match in this period.' : 'The request list is still loading. Try again in a moment.',
				rows: lines.map(entryRow)
			}
		]
	};
}

export function overdueDetail(requests: OverdueRequest[]): ReportDetail {
	return {
		title: 'Overdue Items',
		subtitle: 'Requests past their return date',
		badge: { label: requests.length ? 'Requires attention' : 'All clear', tone: requests.length ? 'bad' : 'good' },
		stat: { label: 'Overdue requests', value: String(requests.length), tone: requests.length ? 'bad' : 'good' },
		sections: [
			{
				title: 'Overdue requests',
				empty: 'Nothing is overdue.',
				rows: requests.map((r) => ({
					title: r.studentName,
					subtitle: `${requestCode(r._id)} · due ${detailDate(r.returnDate)}`,
					meta: plural(r.itemCount, 'item'),
					right: `${Math.round(Math.abs(r.daysOverdue))}d`,
					badge: { label: 'Overdue', tone: 'bad' as DetailTone }
				}))
			}
		]
	};
}

// ── Students ────────────────────────────────────────────────────────────────

export function studentsDetail(
	title: string,
	subtitle: string,
	students: StudentRiskEntry[],
	describe: (s: StudentRiskEntry) => { right?: string; meta?: string; badge?: { label: string; tone: DetailTone } }
): ReportDetail {
	return {
		title,
		subtitle,
		stat: { label: 'Students', value: String(students.length), tone: students.length ? 'warn' : 'good' },
		sections: [
			{
				title: 'Students',
				empty: 'No students in this group.',
				rows: students.map((s) => ({ title: s.studentName, subtitle: s.studentEmail, ...describe(s) }))
			}
		]
	};
}
