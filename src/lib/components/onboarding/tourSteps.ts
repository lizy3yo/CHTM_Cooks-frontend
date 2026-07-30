/**
 * Guided-tour step definitions, per role.
 *
 * The tour is cross-page: a step may declare a `route`, and the engine navigates
 * there (and waits for the page to render) before spotlighting its `target`.
 * Nav-link steps (no `route`) spotlight a sidebar/bottom-nav link — clicking the
 * highlight advances to the next step, which navigates into that page.
 *
 * Some steps set `action: 'click'` — advancing from them performs a real click
 * on the highlighted element to open a READ-ONLY detail view (an item modal, a
 * request detail) so the following steps can explain it. These are only ever
 * placed on safe controls that open details; the tour never clicks Add or
 * Submit, so nothing is ever committed. If the underlying data isn't there
 * (empty catalog, no pending requests), the detail simply doesn't open and the
 * next step falls back to a centered explanation card.
 *
 * Targets are resolved to whichever matching element is currently on-screen, so
 * `a[href=…]` links work in both the desktop sidebar and the mobile bottom nav,
 * and responsive/duplicated `[data-tour]` anchors resolve to the visible copy.
 */

import type { OnboardingRole } from '$lib/stores/onboarding';

export interface TourStep {
	/** CSS selector for the element to spotlight. Omit for a centered card. */
	target?: string;
	/**
	 * Mark a step whose target may not exist (e.g. an "Additional Notes" review
	 * section that only renders when notes were entered). If the target doesn't
	 * appear quickly, the tour skips this step instead of stalling.
	 */
	optional?: boolean;
	/**
	 * Additional element to include in the spotlight when it's visible — the
	 * highlight expands to the bounding box of the target plus this element. Used
	 * to light up a popover the target opens (e.g. a date field and its calendar).
	 * Re-checked continuously so the highlight grows/shrinks as the popover
	 * opens/closes.
	 */
	spotlightWith?: string;
	title: string;
	body: string;
	/** Preferred tooltip side; the tour auto-fits if it doesn't fit. */
	placement?: 'top' | 'bottom' | 'left' | 'right';
	/** Page this step lives on. The engine navigates here first if elsewhere. */
	route?: string;
	/** Overrides the default "Click the highlighted item to continue" hint. */
	clickHint?: string;
	/**
	 * Auto-advance to the next step as soon as this CSS selector becomes visible
	 * — i.e. the user completed the action the step asked for (e.g. an item modal
	 * opened). Lets the tour react to what the user does instead of forcing a
	 * Next click. The user can still click Next manually.
	 */
	advanceWhen?: string;
	/**
	 * Auto-advance as soon as the current page path matches this route — i.e. the
	 * user clicked the highlighted nav link and arrived on that page. Advances
	 * immediately if they are already there.
	 */
	advanceWhenRoute?: string;
	/**
	 * Auto-advance when this form element's value changes from what it was when
	 * the step opened — i.e. the user picked a date, selected a time, chose an
	 * option. Keeps the flow continuous on selection. Pre-filled defaults don't
	 * trigger it; only an actual change does.
	 */
	advanceOnValueChange?: string;
	/**
	 * When this step becomes active, click this element if present — used to
	 * dismiss a leftover open modal (e.g. going Back to "open an item" while the
	 * item modal is still open) so the step starts from a clean state.
	 */
	resetSelector?: string;
	/**
	 * Pin the card to a fixed viewport corner instead of beside the target, so it
	 * never covers a popover the target opens (a date calendar, a time or select
	 * dropdown). The target is still highlighted by the ring. Codes: b/t = bottom/
	 * top, r/l = right/left.
	 */
	pin?: 'br' | 'tr' | 'bl' | 'tl';
	/**
	 * When advancing from this step, actually click the spotlighted element for
	 * real — used to open a read-only detail view (e.g. an item modal) so the
	 * next steps can explain it. Only ever placed on safe, non-committing
	 * controls (opening details, never Add/Submit).
	 */
	action?: 'click';
}

const student: TourStep[] = [
	{
		route: '/student/dashboard',
		title: 'Welcome to the Student Portal 👋',
		body: "Let's take a hands-on tour — and this one is interactive: you'll actually click around and fill out a real borrow request yourself. Don't worry, it's a practice run, so nothing you do here is saved. Read each tip, try it on the page, then click Next. You can skip anytime."
	},

	// ── Dashboard ─────────────────────────────────────────────────────────────
	{
		route: '/student/dashboard',
		target: '[data-tour="student-dash-header"]',
		placement: 'bottom',
		title: 'Your Dashboard',
		body: "This is your home base. Every time you sign in you land here, with a snapshot of your borrowing at a glance. Let's look at the key parts."
	},
	{
		route: '/student/dashboard',
		target: '[data-tour="student-dash-trust"]',
		placement: 'bottom',
		title: 'Trust Score',
		body: 'Your Trust Score reflects your borrowing history. Returning items on time and in good condition keeps it high; late returns or damage lower it. A low score can temporarily limit your ability to request equipment.'
	},
	{
		route: '/student/dashboard',
		target: '[data-tour="student-dash-stats"]',
		placement: 'bottom',
		title: 'Your borrowing at a glance',
		body: 'These cards summarise how many items you currently hold, requests still pending action, and anything overdue. Tap any card to jump straight to that list.'
	},

	// ── Equipment Catalog ────────────────────────────────────────────────────
	{
		target: 'a[href="/student/catalog"]',
		advanceWhenRoute: '/student/catalog',
		placement: 'right',
		clickHint: 'Click here to open the Equipment Catalog',
		title: 'Open the Equipment Catalog',
		body: 'This is where every borrowable item lives. Click it to take a look.'
	},
	{
		route: '/student/catalog',
		target: '[data-tour="student-catalog-header"]',
		placement: 'bottom',
		title: 'The Equipment Catalog',
		body: 'Every item available for borrowing appears here with its photo, availability, and details.'
	},
	{
		route: '/student/catalog',
		target: '[data-tour="student-catalog-search"]',
		placement: 'bottom',
		title: 'Find what you need',
		body: 'Search by name, description, or code to quickly locate an item. Note: you must be enrolled in a class code before you can request equipment.'
	},
	{
		route: '/student/catalog',
		target: '[data-tour="student-catalog-item"]',
		placement: 'right',
		clickHint: 'Click any item to open it',
		advanceWhen: '#catalog-item-modal-title',
		resetSelector: '[data-tour="catalog-modal-close"]',
		title: 'Try it — open an item',
		body: 'Go ahead and click any item to open its details. This is a practice run, so feel free to explore — the tour will continue as soon as the item opens.'
	},
	{
		route: '/student/catalog',
		target: '[data-tour="student-catalog-actions"]',
		placement: 'top',
		clickHint: 'Set a quantity or add it, then click Next',
		title: 'Set quantity & add it',
		body: "These are the item's controls. Use − and + to set how many you need, then add it to your request. Go ahead and try it — nothing is committed during the tour. When you're done, click Next."
	},

	// ── Request Equipment (navigating here closes the item modal) ────────────
	{
		route: '/student/request',
		target: '[data-tour="student-request-header"]',
		placement: 'bottom',
		title: 'Now fill out a request',
		body: "Let's fill out an actual borrow request together. It's a short 4-step wizard — and because you're in the tour, this is a practice run: nothing you enter here is really submitted."
	},
	{
		route: '/student/request',
		target: '[data-tour="student-request-stepper"]',
		placement: 'bottom',
		title: 'The 4 steps',
		body: 'Your request moves through these four steps: 1) Select Items, 2) Schedule & Class, 3) Purpose & Notes, and 4) Review & Submit. This bar tracks where you are.'
	},
	{
		route: '/student/request',
		target: '[data-tour="request-items-section"]',
		placement: 'top',
		title: 'Step 1 — Select Items',
		body: 'The items you added appear here. Adjust quantities or search for more. When you are happy with your items, you are ready to move on.'
	},
	{
		route: '/student/request',
		target: '[data-tour="student-request-continue"]',
		placement: 'top',
		clickHint: 'Click Continue to go to Step 2',
		advanceWhen: '#borrowDate',
		title: 'Continue to Schedule & Class',
		body: 'When your items are ready, click Continue to move to Step 2. The tour will follow you there.'
	},
	{
		route: '/student/request',
		target: '#borrowDate',
		spotlightWith: '[data-tour="borrow-date-calendar"]',
		placement: 'right',
		advanceOnValueChange: '#borrowDate',
		title: 'Step 2 — pick your borrow date',
		body: "Click the date field and choose when you'll borrow the equipment (it must be within the next couple of days). The tour continues once you pick a date."
	},
	{
		route: '/student/request',
		target: '#borrowTimeBtn',
		spotlightWith: '[data-tour="time-dropdown"]',
		placement: 'right',
		advanceOnValueChange: '#borrowTimeBtn',
		title: 'Set your pickup time',
		body: "Click the pickup time and choose when you'll collect the equipment (8 AM–5 PM). The tour continues once you pick one."
	},
	{
		route: '/student/request',
		target: '#returnTimeBtn',
		spotlightWith: '[data-tour="time-dropdown"]',
		placement: 'right',
		advanceOnValueChange: '#returnTimeBtn',
		title: 'Set your return time',
		body: 'Now choose your return time (same day, 8 AM–5 PM). The tour continues once you pick one.'
	},
	{
		route: '/student/request',
		target: '[data-tour="student-request-classcode"]',
		placement: 'left',
		title: 'Choose your Class Code',
		body: 'Pick the class code for the course this request is for — you must be enrolled in it. Then click Next.'
	},
	{
		route: '/student/request',
		target: '[data-tour="student-request-continue"]',
		placement: 'top',
		clickHint: 'Click Continue to go to Step 3',
		advanceWhen: '#purposeDetails',
		title: 'Continue to Purpose',
		body: 'With your dates and class code set, click Continue to move to Step 3.'
	},
	{
		route: '/student/request',
		target: '#purpose',
		placement: 'right',
		advanceOnValueChange: '#purpose',
		title: 'Step 3 — Purpose Type',
		body: "Choose why you're borrowing from the list. The tour continues once you make a selection."
	},
	{
		route: '/student/request',
		target: '#usageLocation',
		placement: 'left',
		advanceOnValueChange: '#usageLocation',
		title: 'Usage Location',
		body: "Choose where you'll use the equipment — in-school or outdoor. The tour continues once you pick."
	},
	{
		route: '/student/request',
		target: '#purposeDetails',
		placement: 'top',
		title: 'Purpose Details',
		body: "Describe specifically how you'll use the equipment. This field is required — type your details, then click Next."
	},
	{
		route: '/student/request',
		target: '#notes',
		placement: 'top',
		title: 'Additional notes (optional)',
		body: 'Add any special instructions for the custodian here, or leave it blank. Then click Next.'
	},
	{
		route: '/student/request',
		target: '[data-tour="student-request-continue"]',
		placement: 'top',
		clickHint: 'Click Continue to go to Step 4',
		advanceWhen: '[data-tour="review-items"]',
		title: 'Continue to Review',
		body: 'Click Continue to reach the final step — Review & Submit.'
	},
	{
		route: '/student/request',
		target: '[data-tour="review-items"]',
		placement: 'bottom',
		title: 'Review — Selected Items',
		body: "This read-only preview lists the items you're requesting and their quantities. Check they're correct — use “Edit Items” if you need to change anything."
	},
	{
		route: '/student/request',
		target: '[data-tour="review-classcode"]',
		placement: 'top',
		title: 'Review — Class Code',
		body: "The class code this request is linked to. Make sure it's the right course."
	},
	{
		route: '/student/request',
		target: '[data-tour="review-purpose"]',
		placement: 'right',
		title: 'Review — Purpose & Usage',
		body: 'Your purpose type, usage location, and purpose details, shown for a final check. Use “Edit” if you spot anything to change.'
	},
	{
		route: '/student/request',
		target: '[data-tour="review-summary"]',
		placement: 'left',
		title: 'Review — Summary',
		body: 'A quick summary of the whole request — item count, usage location, dates, pickup and return times, and duration.'
	},
	{
		route: '/student/request',
		target: '[data-tour="review-notes"]',
		placement: 'top',
		optional: true,
		title: 'Review — Additional Notes',
		body: 'Any notes you added for the custodian appear here. (This section only shows if you added notes.)'
	},
	{
		route: '/student/request',
		target: '[data-tour="review-terms"]',
		placement: 'top',
		title: 'Review — Terms & Conditions',
		body: 'Read the borrowing terms and conditions. You must agree to them before you can submit.'
	},
	{
		route: '/student/request',
		target: '[data-tour="terms-checkbox"]',
		placement: 'right',
		advanceOnValueChange: '[data-tour="terms-checkbox"]',
		title: 'Agree to the terms',
		body: "Tick this box to acknowledge and agree to the terms & conditions. It's required to submit — the tour continues once it's checked."
	},
	{
		route: '/student/request',
		target: '[data-tour="student-request-submit"]',
		placement: 'top',
		clickHint: "Try submitting — it's only practice",
		title: 'Submit your request',
		body: "Everything look right? Click Submit. This is a practice run, so your request won't actually be sent — you'll just see a confirmation."
	},

	// ── My Requests ──────────────────────────────────────────────────────────
	{
		target: 'a[href="/student/requests"]',
		advanceWhenRoute: '/student/requests',
		placement: 'right',
		clickHint: 'Click here to open My Requests',
		title: 'Track Your Requests',
		body: 'After submitting, you can follow your request here. Click to open it.'
	},
	{
		route: '/student/requests',
		target: '[data-tour="student-requests-header"]',
		placement: 'bottom',
		title: 'My Requests',
		body: "Each request shows its status — Under Review, Approved, Ready for Pickup, or Declined. If a request is declined, your instructor's reason appears here so you know what to adjust."
	},

	// ── My Borrowed Items ────────────────────────────────────────────────────
	{
		target: 'a[href="/student/borrowed"]',
		advanceWhenRoute: '/student/borrowed',
		placement: 'right',
		clickHint: 'Click here to open My Borrowed Items',
		title: 'Manage Borrowed Items',
		body: "Items you're currently holding live here. Click to open it."
	},
	{
		route: '/student/borrowed',
		target: '[data-tour="student-borrowed-header"]',
		placement: 'bottom',
		title: 'My Borrowed Items',
		body: 'See what you currently hold, your return deadlines, and any replacement obligations. Return items to the custodian by the due date to keep your record clear.'
	},

	{
		route: '/student/borrowed',
		title: "You're all set! 🎉",
		body: "That's the full borrowing flow, start to finish. You can replay this tour anytime from the Help page. Happy borrowing!"
	}
];

const instructor: TourStep[] = [
	{
		route: '/instructor/dashboard',
		title: 'Welcome, Instructor 👋',
		body: "Let's take a hands-on tour of your tools — reviewing student requests, managing inventory, and tracking activity. I'll open a real request so you can see the review screen, but nothing will be decided. You can skip anytime."
	},

	// ── Student Requests ─────────────────────────────────────────────────────
	{
		target: 'a[href="/instructor/requests"]',
		advanceWhenRoute: '/instructor/requests',
		placement: 'right',
		clickHint: 'Click here to open Student Requests',
		title: 'Review Student Requests',
		body: "This is where you'll spend most of your time. Click to open it."
	},
	{
		route: '/instructor/requests',
		target: '[data-tour="instructor-requests-header"]',
		placement: 'bottom',
		title: 'Student Requests',
		body: 'Pending borrow requests wait here for your decision. Let’s open one to see the review screen.'
	},
	{
		route: '/instructor/requests',
		target: '[data-tour="instructor-request-row"]',
		placement: 'bottom',
		clickHint: 'Click a request to open it',
		advanceWhen: '[data-tour="instructor-request-detail"]',
		title: 'Open a request',
		body: 'Go ahead and click any request to open its review screen. This just opens the record — nothing is decided. The tour continues as soon as it opens.'
	},
	{
		route: '/instructor/requests',
		target: '[data-tour="instructor-request-detail"]',
		placement: 'bottom',
		title: 'The review screen',
		body: 'Here you see the student, the items, the dates, and the purpose. From here you Approve or Decline — and when you decline, you pick a standard reason and a professional message is sent to the student automatically. We won’t decide anything during this tour.'
	},

	// ── Inventory (navigating here closes the request modal) ─────────────────
	{
		route: '/instructor/inventory',
		target: '[data-tour="instructor-inventory-header"]',
		placement: 'bottom',
		title: 'Inventory Management',
		body: 'Browse current stock, item details, and availability so your approval decisions are well-informed.'
	},

	// ── Reports & Analytics ──────────────────────────────────────────────────
	{
		target: 'a[href="/instructor/reports"]',
		advanceWhenRoute: '/instructor/reports',
		placement: 'right',
		clickHint: 'Click here to open Reports & Analytics',
		title: 'Reports & Analytics',
		body: 'Want the bigger picture? Click to open your reports.'
	},
	{
		route: '/instructor/reports',
		target: '[data-tour="instructor-reports-header"]',
		placement: 'bottom',
		title: 'Reports & Analytics',
		body: 'Track borrowing trends, equipment usage, and student activity through visual reports you can review at a glance.'
	},

	{
		route: '/instructor/reports',
		title: "You're ready to go! 🎉",
		body: 'Replay this tour anytime from the Help page, which also has FAQs and support chat.'
	}
];

const custodian: TourStep[] = [
	{
		route: '/custodian/dashboard',
		title: 'Welcome, Custodian 👋',
		body: "Let's take a hands-on tour of your workflow — releasing approved items, processing returns, and keeping inventory accurate. I'll open a real request so you can see the detail screen, but nothing will be changed. You can skip anytime."
	},

	// ── Requests & Borrowed Items ────────────────────────────────────────────
	{
		target: 'a[href="/custodian/requests"]',
		advanceWhenRoute: '/custodian/requests',
		placement: 'right',
		clickHint: 'Click here to open Requests & Borrowed Items',
		title: 'Release Approved Requests',
		body: 'Approved requests are ready for you to hand out here. Click to open it.'
	},
	{
		route: '/custodian/requests',
		target: '[data-tour="custodian-requests-header"]',
		placement: 'bottom',
		title: 'Requests & Borrowed Items',
		body: "This is your hub for releasing equipment and tracking what's out on loan. Let's open a request to see the details."
	},
	{
		route: '/custodian/requests',
		target: '[data-tour="custodian-request-row"]',
		placement: 'bottom',
		clickHint: 'Click a request to open it',
		advanceWhen: '[data-tour="custodian-request-detail"]',
		title: 'Open a request',
		body: 'Go ahead and click any request to open its detail view. This just opens the record — nothing is changed. The tour continues as soon as it opens.'
	},
	{
		route: '/custodian/requests',
		target: '[data-tour="custodian-request-detail"]',
		placement: 'bottom',
		title: 'The request detail screen',
		body: 'From here you release approved items, confirm hand-offs to students, and process returns — inspecting items and recording their condition. We won’t change anything during this tour.'
	},

	// ── Inventory (navigating here closes the request modal) ─────────────────
	{
		route: '/custodian/inventory',
		target: '[data-tour="custodian-inventory-header"]',
		placement: 'bottom',
		title: 'Inventory Management',
		body: "Maintain stock counts, item details, and availability so students always see what's truly on hand."
	},

	// ── Transactions ─────────────────────────────────────────────────────────
	{
		target: 'a[href="/custodian/transactions"]',
		advanceWhenRoute: '/custodian/transactions',
		placement: 'right',
		clickHint: 'Click here to open Transactions',
		title: 'Handle Returns & Transactions',
		body: 'Process returns and special cases here. Click to open it.'
	},
	{
		route: '/custodian/transactions',
		target: '[data-tour="custodian-transactions-header"]',
		placement: 'bottom',
		title: 'Alternative Transactions',
		body: 'Inspect returned items, record their condition, and complete each transaction — including replacements for lost or damaged equipment.'
	},

	{
		route: '/custodian/transactions',
		title: "You're all set! 🎉",
		body: 'Replay this tour anytime from the Help page, which also has FAQs and support chat.'
	}
];

export const tourSteps: Record<OnboardingRole, TourStep[]> = {
	student,
	instructor,
	custodian
};

// ── Page-by-page chaptering ──────────────────────────────────────────────────
// The tour is presented one page at a time: consecutive steps that live on the
// same route form a chapter, so the user always knows which page they're on,
// how far through it they are, and which page comes next.

/** Friendly page names shown in the tour header. */
const PAGE_LABELS: Record<string, string> = {
	'/student/dashboard': 'Dashboard',
	'/student/catalog': 'Equipment Catalog',
	'/student/request': 'New Request',
	'/student/requests': 'My Requests',
	'/student/borrowed': 'Borrowed Items',
	'/instructor/dashboard': 'Dashboard',
	'/instructor/requests': 'Request Approvals',
	'/instructor/inventory': 'Inventory',
	'/instructor/reports': 'Reports & Analytics',
	'/custodian/dashboard': 'Dashboard',
	'/custodian/requests': 'Requests',
	'/custodian/inventory': 'Inventory',
	'/custodian/transactions': 'Alternative Transactions'
};

export function pageLabelFor(route: string | undefined): string {
	if (!route) return 'Getting Started';
	return PAGE_LABELS[route] ?? route.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ?? 'Page';
}

export interface TourChapter {
	/** Route every step in this chapter belongs to. */
	route: string;
	/** Friendly page name. */
	label: string;
	/** Index of this chapter's first step in the flat step array. */
	startIndex: number;
	/** Number of steps on this page. */
	count: number;
}

/**
 * Group a role's steps into per-page chapters. Steps without their own `route`
 * (nav-link steps that spotlight a sidebar link) belong to the page they are
 * displayed on, i.e. they carry forward the previous step's route.
 */
export function buildChapters(steps: TourStep[]): TourChapter[] {
	const chapters: TourChapter[] = [];
	let currentRoute = '';
	steps.forEach((step, i) => {
		if (step.route) currentRoute = step.route;
		const last = chapters[chapters.length - 1];
		if (last && last.route === currentRoute) {
			last.count += 1;
		} else {
			chapters.push({ route: currentRoute, label: pageLabelFor(currentRoute), startIndex: i, count: 1 });
		}
	});
	return chapters;
}
