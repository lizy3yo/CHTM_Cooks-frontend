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
	import { tourSteps } from './tourSteps';
	import OnboardingTour from './OnboardingTour.svelte';

	interface Props {
		role: OnboardingRole;
	}

	let { role }: Props = $props();

	let open = $state(false);
	const steps = $derived(tourSteps[role]);

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
		if (autoChecked || !id) return;
		if (!path.startsWith(`/${role}`)) return;

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
