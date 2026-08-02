<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import {
		hasCompletedOnboarding,
		markOnboardingComplete,
		practiceMode,
		tourRequest,
		tourReset,
		type OnboardingRole
	} from '$lib/stores/onboarding';
	import { tourSteps, studentUnenrolled } from './tourSteps';
	import OnboardingTour from './OnboardingTour.svelte';

	interface Props {
		role: OnboardingRole;
	}

	let { role }: Props = $props();

	let open = $state(false);

	// ── Enrollment-aware variant (students only) ─────────────────────────────
	// A student with no active class-code enrollment cannot submit a borrow
	// request — the whole request wizard is gated — so the standard hands-on tour
	// would lead them into a dead end. Such students get a dedicated variant that
	// orients them and explains how to get enrolled instead. `null` = not yet
	// known. Only ever read behind a `role === 'student'` guard, so for other
	// roles it simply stays `null` and never affects the tour.
	let studentEnrolled = $state<boolean | null>(null);

	$effect(() => {
		if (role !== 'student') return;
		const id = userId;
		if (!id || studentEnrolled !== null) return;
		let cancelled = false;
		void (async () => {
			try {
				const res = await fetch('/api/class-codes/my-classes', { credentials: 'include' });
				if (!res.ok) throw new Error('lookup failed');
				const data = await res.json();
				if (!cancelled) studentEnrolled = (data.classCodes?.length ?? 0) > 0;
			} catch {
				// If we can't tell, assume enrolled — never wrongly greet a real
				// borrower with the "you're not enrolled yet" tour.
				if (!cancelled) studentEnrolled = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	const steps = $derived(
		role === 'student' && studentEnrolled === false ? studentUnenrolled : tourSteps[role]
	);

	const userId = $derived($user?.id ?? null);
	/**
	 * Account-level tour state. `undefined` while the session payload hasn't
	 * provided it (falls back to the device flag); `null` means this account has
	 * never been through the tour — the case for every newly created or imported
	 * user, so they get it on first login regardless of device.
	 */
	const serverCompletedAt = $derived($user ? ($user.onboardingCompletedAt ?? null) : undefined);

	// ── Auto-start for first-time users ──────────────────────────────────────
	// Fires once per session, the first time a signed-in user lands anywhere in
	// their role's area and hasn't seen the tour yet — so it greets them on first
	// login regardless of which page they arrive on. The tour itself navigates to
	// the first step's page, so it always begins from a known context.
	//
	// `autoChecked` is deliberately a plain variable, NOT $state: the effect reads
	// it as a guard, so making it reactive would re-trigger the effect the moment
	// it's set, and the re-run's cleanup would cancel the pending start timer
	// before it ever fired.
	let autoChecked = false;
	let autoStartTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const id = userId;
		const path = $page.url.pathname;
		const enrolled = studentEnrolled; // dependency: re-run once enrollment resolves
		if (autoChecked || !id) return;
		if (!path.startsWith(`/${role}`)) return;
		// For students, hold until enrollment is known so the correct variant
		// (standard vs. unenrolled) starts — don't consume the once-per-session
		// guard while we're still undecided.
		if (role === 'student' && enrolled === null) return;

		autoChecked = true;
		if (hasCompletedOnboarding(role, id, serverCompletedAt)) return;

		// Small delay so the sidebar / bottom nav have rendered and the first
		// step's spotlight target is measurable.
		autoStartTimer = setTimeout(() => {
			autoStartTimer = null;
			open = true;
		}, 600);
	});

	// Don't leave a pending start timer behind if the user leaves the role area.
	onDestroy(() => {
		if (autoStartTimer) clearTimeout(autoStartTimer);
	});

	// ── Manual replay (from the Help page) ───────────────────────────────────
	let lastNonce = 0;
	$effect(() => {
		const req = $tourRequest;
		if (req && req.role === role && req.nonce !== lastNonce) {
			lastNonce = req.nonce;
			open = true;
		}
	});

	// ── Re-arm after a reset (from the Help page) ────────────────────────────
	// Dropping the once-per-session guard lets the tour auto-appear again the
	// next time the user lands on their dashboard — matching new-user behavior.
	let lastResetNonce = 0;
	$effect(() => {
		const r = $tourReset;
		if (r && r.role === role && r.nonce !== lastResetNonce) {
			lastResetNonce = r.nonce;
			autoChecked = false;
		}
	});

	// Turn on practice/sandbox mode whenever the tour is open, so real writes
	// (submitting a request, etc.) are intercepted while the user explores.
	$effect(() => {
		practiceMode.set(open);
	});

	function handleDone(): void {
		open = false;
		if (userId) markOnboardingComplete(role, userId);
	}
</script>

<OnboardingTour {steps} {open} onDone={handleDone} />
