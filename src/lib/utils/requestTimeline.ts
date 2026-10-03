import type { BorrowRequestRecord } from '$lib/api/borrowRequests';

/**
 * The lifecycle of a borrow request as a timeline, built from the record's
 * own timestamps — one builder for every role's detail view, so the student,
 * instructor, custodian, admin and superadmin all see the same history.
 *
 * Happy path:  Submitted → Approved → Ready for Pickup → Picked Up → Returned
 *
 * Steps already reached carry the real time they happened; steps not yet
 * reached are listed as upcoming so the whole path is always visible. A
 * request that ends early (declined, cancelled, expired) stops at that
 * outcome instead of showing steps that will never happen.
 */

export type TimelineStepState =
	/** Done, on the normal path. */
	| 'complete'
	/** Waiting on someone right now. */
	| 'current'
	/** Not reached yet. */
	| 'upcoming'
	/** Done, but with a problem: overdue, damaged or missing items. */
	| 'warning'
	/** Ended the request unsuccessfully: declined, expired. */
	| 'failed'
	/** Ended the request by withdrawal. */
	| 'cancelled';

export type TimelineStepKind =
	| 'submitted'
	| 'review'
	| 'declined'
	| 'appealed'
	| 'approved'
	| 'ready'
	| 'pickup'
	| 'return'
	| 'checkin'
	| 'issues'
	| 'resolved'
	| 'cancelled'
	| 'expired';

export interface TimelineStep {
	kind: TimelineStepKind;
	label: string;
	state: TimelineStepState;
	/** ISO time the step happened; null until it has. */
	at: string | null;
	/** Who did it, or who it is waiting on. */
	actor: string | null;
	/** One short line of context: a reason, a due date, an incident summary. */
	note: string | null;
}

export interface TimelineOptions {
	/** Students see "You" for their own actions; staff see the student's name. */
	viewer?: 'student' | 'staff';
	/** Injectable for tests; defaults to the current time. */
	now?: Date;
}

const DAY_MS = 86_400_000;

function name(user: { fullName?: string } | undefined | null): string | null {
	const n = user?.fullName?.trim();
	return n ? n : null;
}

function isCancelled(r: BorrowRequestRecord): boolean {
	// Older records stored a student cancellation as a rejection with this reason.
	return r.status === 'cancelled' || (r.status === 'rejected' && r.rejectReason === 'Request cancelled by student');
}

function shortDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function buildRequestTimeline(r: BorrowRequestRecord, options: TimelineOptions = {}): TimelineStep[] {
	const viewer = options.viewer ?? 'staff';
	const now = options.now ?? new Date();

	const student = viewer === 'student' ? 'You' : (name(r.student) ?? 'Student');
	const instructor = name(r.instructor) ?? 'Instructor';
	const custodian = name(r.custodian) ?? 'Custodian';

	const steps: TimelineStep[] = [];
	const add = (step: Omit<TimelineStep, 'note'> & { note?: string | null }) =>
		steps.push({ note: null, ...step });

	add({ kind: 'submitted', label: 'Request Submitted', state: 'complete', at: r.createdAt, actor: student });

	// ── Decision: decline / appeal history, then approval ──────────────────
	// A request can be declined, appealed and then approved. Only the latest
	// decline time is stored, so order the two by timestamp.
	const declined = r.rejectedAt && !isCancelled(r);
	if (declined && r.appealedAt && new Date(r.appealedAt) < new Date(r.rejectedAt!)) {
		add({ kind: 'appealed', label: 'Appeal Submitted', state: 'complete', at: r.appealedAt, actor: student, note: r.appealReason ?? null });
	}
	if (declined) {
		const final = r.status === 'rejected';
		add({
			kind: 'declined',
			label: 'Declined',
			// Overturned on appeal: part of the history, but not a success.
			state: final ? 'failed' : 'warning',
			at: r.rejectedAt!,
			actor: instructor,
			note: r.rejectReason ?? null
		});
	}
	if (declined && r.appealedAt && new Date(r.appealedAt) >= new Date(r.rejectedAt!)) {
		add({ kind: 'appealed', label: 'Appeal Submitted', state: 'complete', at: r.appealedAt, actor: student, note: r.appealReason ?? null });
	}

	if (r.status === 'rejected' && !isCancelled(r)) return steps;

	if (r.status === 'pending_instructor' || r.status === 'pending_appeal') {
		add({
			kind: 'review',
			label: r.status === 'pending_appeal' ? 'Appeal Review' : 'Instructor Review',
			state: 'current',
			at: null,
			actor: instructor,
			note: 'Awaiting decision'
		});
	} else if (r.approvedAt) {
		add({ kind: 'approved', label: 'Approved', state: 'complete', at: r.approvedAt, actor: instructor });
	}

	// ── Storeroom: prepare, hand over ──────────────────────────────────────
	if (r.releasedAt) {
		add({ kind: 'ready', label: 'Ready for Pickup', state: 'complete', at: r.releasedAt, actor: custodian });
	} else if (r.status === 'approved_instructor') {
		add({ kind: 'ready', label: 'Ready for Pickup', state: 'current', at: null, actor: 'Custodian', note: 'Items being prepared' });
	}

	if (r.pickedUpAt) {
		add({ kind: 'pickup', label: 'Picked Up', state: 'complete', at: r.pickedUpAt, actor: student });
	} else if (r.status === 'ready_for_pickup') {
		add({
			kind: 'pickup',
			label: 'Picked Up',
			state: 'current',
			at: null,
			actor: student,
			note: r.borrowDate ? `Pickup on ${shortDate(r.borrowDate)}` : 'Awaiting pickup'
		});
	}

	// ── Early endings ─────────────────────────────────────────────────────
	if (isCancelled(r)) {
		const by = r.cancelledBy;
		add({
			kind: 'cancelled',
			label: 'Cancelled',
			state: 'cancelled',
			// Records cancelled before cancelledAt existed fall back to the last update.
			at: r.cancelledAt ?? r.updatedAt,
			actor: by ? (by.id === r.studentId ? student : (name(by) ?? null)) : null
		});
		return steps;
	}
	if (r.status === 'expired') {
		add({
			kind: 'expired',
			label: 'Expired',
			state: 'failed',
			at: r.expiredAt ?? r.updatedAt,
			actor: null,
			note: 'Not picked up on the booked day'
		});
		return steps;
	}

	// ── Return and check-in ───────────────────────────────────────────────
	const inspected = r.items.filter((i) => i.inspection);
	const missing = inspected.filter((i) => i.inspection!.status === 'missing').length;
	const damaged = inspected.filter((i) => i.inspection!.status === 'damaged').length;
	const hasIssues = r.status === 'missing' || r.status === 'resolved' || missing > 0 || damaged > 0;

	if (r.status === 'borrowed') {
		const overdueDays = r.returnDate ? Math.ceil((now.getTime() - new Date(r.returnDate).getTime()) / DAY_MS) : 0;
		const overdue = overdueDays > 0;
		add({
			kind: 'return',
			label: overdue ? 'Return Overdue' : 'Return Due',
			state: overdue ? 'warning' : 'current',
			// Not returned yet: the due date lives in the note, never in `at`.
			at: null,
			actor: student,
			note: overdue
				? `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
				: r.returnDate
					? `Due ${shortDate(r.returnDate)}`
					: null
		});
	} else if (r.status === 'pending_return') {
		add({ kind: 'return', label: 'Return Submitted', state: 'complete', at: r.returnedAt ?? null, actor: student });
		add({ kind: 'checkin', label: 'Checked In', state: 'current', at: null, actor: 'Custodian', note: 'Awaiting inspection' });
	} else if (r.status === 'returned' && !hasIssues) {
		add({
			kind: 'return',
			label: 'Returned',
			state: 'complete',
			at: r.returnedAt ?? r.updatedAt,
			actor: 'Custodian',
			note: 'All items in good condition'
		});
	} else if (hasIssues && (r.status === 'missing' || r.status === 'resolved' || r.status === 'returned')) {
		const parts = [
			missing ? `${missing} missing` : null,
			damaged ? `${damaged} damaged` : null
		].filter(Boolean);
		add({
			kind: 'issues',
			// markMissing() closes a request without a check-in; inspection records one.
			label: inspected.length ? 'Returned with Issues' : 'Reported Missing',
			state: 'warning',
			at: r.returnedAt ?? r.missingAt ?? null,
			actor: 'Custodian',
			note: parts.length ? parts.join(', ') : 'Items reported missing'
		});
		add(
			r.status === 'resolved'
				? { kind: 'resolved', label: 'Resolved', state: 'complete', at: r.resolvedAt ?? r.updatedAt, actor: 'Custodian', note: 'Replacements settled' }
				: { kind: 'resolved', label: 'Resolved', state: 'current', at: null, actor: student, note: 'Replacement pending' }
		);
	}

	// ── Everything not reached yet ────────────────────────────────────────
	// Keep the full path visible so nobody has to guess what comes next.
	const reached = new Set(steps.map((s) => s.kind));
	const upcoming: Array<[TimelineStepKind, string, string]> = [
		['approved', 'Approved', instructor],
		['ready', 'Ready for Pickup', 'Custodian'],
		['pickup', 'Picked Up', student],
		['return', 'Returned', student]
	];
	const stillOpen = !['returned', 'missing', 'resolved'].includes(r.status);
	if (stillOpen) {
		for (const [kind, label, actor] of upcoming) {
			if (kind === 'approved' && reached.has('review')) {
				// Review already stands in for the approval step.
				continue;
			}
			if (!reached.has(kind)) add({ kind, label, state: 'upcoming', at: null, actor });
		}
	}

	return steps;
}

