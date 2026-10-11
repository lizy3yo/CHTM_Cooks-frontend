import type { BorrowRequestEvent, BorrowRequestEventName, BorrowRequestRecord } from '$lib/api/borrowRequests';

/**
 * The lifecycle of a borrow request as a timeline — one builder for every
 * role's detail view, so the student, instructor, custodian, admin and
 * superadmin all see the same history.
 *
 * Happy path:  Submitted → Approved → Awaiting Preparation → Ready for Pickup
 *              → Released → Return Submitted → Inspected → Returned
 *
 * Times and names come from the request's recorded events, which name the
 * person who actually performed each step. Requests older than that history
 * fall back to the record's own timestamps and assigned staff.
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
	| 'preparing'
	| 'ready'
	| 'pickup'
	| 'return'
	| 'checkin'
	| 'returned'
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

/** "25m", "4h 25m", "2d 3h" — how long a step took. */
function duration(fromIso: string, toIso: string): string | null {
	const minutes = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
	if (!Number.isFinite(minutes) || minutes < 0) return null;
	if (minutes < 60) return `${Math.max(1, minutes)}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function buildRequestTimeline(r: BorrowRequestRecord, options: TimelineOptions = {}): TimelineStep[] {
	const viewer = options.viewer ?? 'staff';
	const now = options.now ?? new Date();

	const student = viewer === 'student' ? 'You' : (name(r.student) ?? 'Student');
	const instructor = name(r.instructor) ?? 'Instructor';
	const custodian = name(r.custodian) ?? 'Custodian';

	// The latest recorded event of each kind; a request can be declined and
	// approved again, and only the most recent one describes where it stands.
	const events = new Map<BorrowRequestEventName, BorrowRequestEvent>();
	for (const e of r.events ?? []) events.set(e.event, e);

	/** The person recorded for an event, or `fallback` when none was. */
	const actorOf = (event: BorrowRequestEvent | undefined, fallback: string | null): string | null => {
		if (!event?.actorId) return fallback;
		if (event.actorId === r.studentId) return student;
		return event.actorName?.trim() || fallback;
	};

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
			actor: actorOf(events.get('rejected'), instructor),
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
		add({ kind: 'approved', label: 'Approved', state: 'complete', at: r.approvedAt, actor: actorOf(events.get('approved'), instructor) });
	}

	// ── Storeroom: prepare, hand over ──────────────────────────────────────
	// Students collect; staff release. Same step, named from each side.
	const pickupLabel = viewer === 'student' ? 'Picked Up' : 'Released to Student';

	if (r.status === 'approved_instructor') {
		add({ kind: 'preparing', label: 'Awaiting Preparation', state: 'current', at: null, actor: 'Custodian', note: 'Items being prepared' });
	} else if (r.approvedAt && r.releasedAt) {
		const took = duration(r.approvedAt, r.releasedAt);
		add({
			kind: 'preparing',
			label: 'Awaiting Preparation',
			state: 'complete',
			// The wait starts the moment the request is approved.
			at: r.approvedAt,
			actor: null,
			note: took ? `Prepared in ${took}` : null
		});
	}

	if (r.releasedAt) {
		add({ kind: 'ready', label: 'Ready for Pickup', state: 'complete', at: r.releasedAt, actor: actorOf(events.get('ready_for_pickup'), custodian) });
	}

	if (r.pickedUpAt) {
		// Handed over by staff; older records never stored who.
		add({ kind: 'pickup', label: pickupLabel, state: 'complete', at: r.pickedUpAt, actor: actorOf(events.get('picked_up'), 'Custodian') });
	} else if (r.status === 'ready_for_pickup') {
		add({
			kind: 'pickup',
			label: pickupLabel,
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
	const { missing, damaged } = returnTotals(r);
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
				? `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}${r.overdueNoticeSentAt ? ' · notice sent' : ''}`
				: r.returnDate
					? `Due ${shortDate(r.returnDate)}`
					: null
		});
	} else if (r.status === 'pending_return') {
		const submitted = events.get('return_initiated');
		add({ kind: 'return', label: 'Return Submitted', state: 'complete', at: submitted?.at ?? r.returnedAt ?? null, actor: actorOf(submitted, student) });
		add({ kind: 'checkin', label: 'Inspection', state: 'current', at: null, actor: 'Custodian', note: 'Awaiting inspection' });
	} else if (r.status === 'returned' || r.status === 'missing' || r.status === 'resolved') {
		const submitted = events.get('return_initiated');
		const inspection = events.get('inspected');
		const closedAt = inspection?.at ?? r.returnedAt ?? r.missingAt ?? null;

		// returned_at is overwritten at inspection, so the hand-back time is
		// only known when it was recorded as its own event.
		if (submitted) {
			add({ kind: 'return', label: 'Return Submitted', state: 'complete', at: submitted.at, actor: actorOf(submitted, student) });
		}
		if (inspection || inspected.length) {
			add({ kind: 'checkin', label: 'Inspected', state: 'complete', at: closedAt ?? r.updatedAt, actor: actorOf(inspection, 'Custodian') });
		}

		if (!hasIssues) {
			add({
				kind: 'returned',
				label: 'Returned',
				state: 'complete',
				at: closedAt ?? r.updatedAt,
				actor: null,
				note: 'All items in good condition'
			});
		} else {
			const parts = [
				missing ? `${missing} missing` : null,
				damaged ? `${damaged} damaged` : null
			].filter(Boolean);
			add({
				kind: 'issues',
				// markMissing() closes a request without a check-in; inspection records one.
				label: inspected.length ? 'Returned with Issues' : 'Reported Missing',
				state: 'warning',
				at: closedAt,
				actor: inspected.length ? null : actorOf(events.get('missing'), 'Custodian'),
				note: parts.length ? parts.join(', ') : 'Items reported missing'
			});
			add(
				r.status === 'resolved'
					? { kind: 'resolved', label: 'Resolved', state: 'complete', at: r.resolvedAt ?? r.updatedAt, actor: actorOf(events.get('resolved'), 'Custodian'), note: 'Replacements settled' }
					: { kind: 'resolved', label: 'Resolved', state: 'current', at: null, actor: student, note: 'Replacement pending' }
			);
		}
	}

	// ── Everything not reached yet ────────────────────────────────────────
	// Keep the full path visible so nobody has to guess what comes next.
	const reached = new Set(steps.map((s) => s.kind));
	const upcoming: Array<[TimelineStepKind, string, string]> = [
		['approved', 'Approved', instructor],
		['preparing', 'Awaiting Preparation', 'Custodian'],
		['ready', 'Ready for Pickup', 'Custodian'],
		['pickup', pickupLabel, viewer === 'student' ? student : 'Custodian'],
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


/**
 * Who approved the request. The assigned instructor is only the default
 * reviewer: a co-instructor of the class or a superadmin may have decided it.
 */
export function approverName(r: BorrowRequestRecord): string | null {
	const approval = (r.events ?? []).findLast((e) => e.event === 'approved');
	return approval?.actorName?.trim() || name(r.instructor);
}

/** Units returned in each condition across the whole request. */
export interface ReturnTotals {
	good: number;
	damaged: number;
	missing: number;
	/** Extra units handed in on top of what was borrowed. */
	over: number;
	/** False until at least one line has been inspected. */
	inspected: boolean;
}

/**
 * Unit counts for one inspected line. Lines inspected before the counts were
 * stored only carry a status, so the affected quantity is counted under it.
 */
export function inspectionUnits(item: BorrowRequestRecord['items'][number]): Omit<ReturnTotals, 'inspected'> {
	const inspection = item.inspection;
	if (!inspection) return { good: 0, damaged: 0, missing: 0, over: 0 };

	if (inspection.goodQuantity !== undefined) {
		return {
			good: inspection.goodQuantity,
			damaged: inspection.damagedQuantity ?? 0,
			missing: inspection.missingQuantity ?? 0,
			over: inspection.overReturnedQuantity ?? 0
		};
	}

	const affected = inspection.status === 'good' ? 0 : Math.min(item.quantity, inspection.replacementQuantity ?? item.quantity);
	return {
		good: item.quantity - affected,
		damaged: inspection.status === 'damaged' ? affected : 0,
		missing: inspection.status === 'missing' ? affected : 0,
		over: 0
	};
}

export function returnTotals(r: BorrowRequestRecord): ReturnTotals {
	const totals: ReturnTotals = { good: 0, damaged: 0, missing: 0, over: 0, inspected: false };
	for (const item of r.items) {
		if (!item.inspection) continue;
		const units = inspectionUnits(item);
		totals.good += units.good;
		totals.damaged += units.damaged;
		totals.missing += units.missing;
		totals.over += units.over;
		totals.inspected = true;
	}
	return totals;
}

/** How long the items have been (or were) out, measured against the due date. */
export interface BorrowDayCount {
	/** The pickup day is day 1. */
	daysBorrowed: number;
	/** True while the items are still with the student. */
	out: boolean;
	dueAt: string | null;
	/** Whole days until the due date while out; null once back or past due. */
	daysLeft: number | null;
	/** Whole days past the due date: still counting while out, final once back. */
	daysLate: number;
	dueToday: boolean;
}

/** Null until the items have actually been handed over. */
export function borrowDayCount(r: BorrowRequestRecord, now: Date = new Date()): BorrowDayCount | null {
	if (!r.pickedUpAt) return null;

	const out = r.status === 'borrowed';
	const events = r.events ?? [];
	// The clock stops when the student hands the items back, not when the
	// custodian gets round to inspecting them.
	const handedBack =
		events.findLast((e) => e.event === 'return_initiated')?.at ??
		events.findLast((e) => e.event === 'inspected')?.at ??
		r.returnedAt ??
		r.missingAt;
	const end = out || !handedBack ? now : new Date(handedBack);

	const start = new Date(r.pickedUpAt).getTime();
	const daysBorrowed = Math.max(1, Math.floor((end.getTime() - start) / DAY_MS) + 1);

	const due = r.returnDate ? new Date(r.returnDate) : null;
	const msPastDue = due ? end.getTime() - due.getTime() : 0;
	const daysLate = msPastDue > 0 ? Math.ceil(msPastDue / DAY_MS) : 0;

	return {
		daysBorrowed,
		out,
		dueAt: r.returnDate ?? null,
		daysLeft: out && due && msPastDue <= 0 ? Math.ceil(-msPastDue / DAY_MS) : null,
		daysLate,
		dueToday: !!due && out && msPastDue <= 0 && due.toDateString() === now.toDateString()
	};
}
