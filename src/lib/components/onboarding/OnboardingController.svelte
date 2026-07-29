<script lang="ts">
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

	// ── Auto-start for first-time users ──────────────────────────────────────
	// Fires once, when the user lands on their dashboard and hasn't seen the
	// tour yet. Gated to the dashboard so the tour always begins from a known
	// context. A short delay lets the sidebar/bottom nav finish rendering so the
	// spotlight targets are measurable.
	let autoChecked = $state(false);
	$effect(() => {
		const id = userId;
		const onDashboard = $page.url.pathname.includes(`/${role}/dashboard`);
		if (autoChecked || open || !id || !onDashboard) return;
		autoChecked = true;
		if (!hasCompletedOnboarding(role, id)) {
			const t = setTimeout(() => {
				open = true;
			}, 500);
			return () => clearTimeout(t);
		}
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
