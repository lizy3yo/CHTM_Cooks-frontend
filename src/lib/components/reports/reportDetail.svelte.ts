/**
 * The details window shared by every Reports & Analytics tab.
 *
 * Any number, bar or row in the reports can describe what lies behind it as a
 * `ReportDetail` and call `openReportDetail`; one `ReportDetailModal`, mounted
 * by the reports screen, shows it. Keeping the description as plain data means
 * a new clickable figure needs no new modal.
 */

export type DetailTone = 'good' | 'bad' | 'warn' | 'info' | 'neutral';

export interface DetailRow {
	/** Set (even to null) when the row is about an item: shows its photo or the placeholder. */
	picture?: string | null;
	title: string;
	subtitle?: string;
	meta?: string;
	/** Short value on the right, such as a quantity. */
	right?: string;
	badge?: { label: string; tone: DetailTone };
}

export interface DetailSection {
	title: string;
	rows: DetailRow[];
	/** Shown when there are no rows. */
	empty?: string;
}

export interface ReportDetail {
	title: string;
	subtitle?: string;
	badge?: { label: string; tone: DetailTone };
	/** Set (even to null) when the detail is about one item: shows its photo or the placeholder. */
	picture?: string | null;
	/** The headline figure. */
	stat?: { label: string; value: string; tone?: DetailTone };
	fields?: { label: string; value: string | number | null | undefined }[];
	note?: { label: string; text: string };
	sections?: DetailSection[];
	/** Inspection photos and the like. */
	photos?: string[];
	/** Links to documents, such as a signed deed. */
	files?: { label: string; url: string }[];
}

export const reportDetail = $state<{ current: ReportDetail | null }>({ current: null });

export function openReportDetail(detail: ReportDetail): void {
	reportDetail.current = detail;
}

export function closeReportDetail(): void {
	reportDetail.current = null;
}

/**
 * Attributes that make a non-button element (a table row, a card) open its
 * details by mouse and by keyboard. Spread onto the element.
 */
export function opensDetail(build: () => ReportDetail | null | undefined, label?: string) {
	const open = () => {
		const detail = build();
		if (detail) openReportDetail(detail);
	};
	return {
		role: 'button',
		tabindex: 0,
		'aria-label': label,
		onclick: open,
		onkeydown: (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				open();
			}
		}
	};
}

/** Hover and focus styling for anything that opens details. */
export const DETAIL_HOVER =
	'cursor-pointer transition hover:bg-pink-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500';

// ── Formatting shared by the detail builders ────────────────────────────────

export function detailDate(iso?: string | null, withTime = false): string {
	if (!iso) return '—';
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '—';
	return withTime
		? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
		: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function detailPeso(amount?: number | null): string {
	if (amount === null || amount === undefined) return '—';
	return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

export function requestCode(id: string | number): string {
	return 'REQ-' + String(id).slice(-6).toUpperCase();
}

const STATUS_LABELS: Record<string, { label: string; tone: DetailTone }> = {
	pending_instructor: { label: 'Under Review', tone: 'warn' },
	approved_instructor: { label: 'Approved', tone: 'info' },
	ready_for_pickup: { label: 'Ready for Pickup', tone: 'info' },
	borrowed: { label: 'Borrowed', tone: 'info' },
	pending_return: { label: 'Pending Return', tone: 'warn' },
	returned: { label: 'Returned', tone: 'good' },
	resolved: { label: 'Resolved', tone: 'good' },
	missing: { label: 'Item Issue', tone: 'bad' },
	rejected: { label: 'Rejected', tone: 'bad' },
	cancelled: { label: 'Cancelled', tone: 'neutral' },
	expired: { label: 'Expired', tone: 'neutral' },
	pending_appeal: { label: 'Appealed', tone: 'warn' }
};

export function statusBadge(status: string): { label: string; tone: DetailTone } {
	return (
		STATUS_LABELS[status] ?? {
			label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
			tone: 'neutral'
		}
	);
}
