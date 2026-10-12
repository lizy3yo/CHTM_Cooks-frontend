<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, isAuthenticated, isLoading } from '$lib/stores/auth';
	import { loadingStore } from '$lib/stores/loading';
	import { startRealtime, stopRealtime } from '$lib/api/realtime';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
	import ForcePasswordChange from '$lib/components/auth/ForcePasswordChange.svelte';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
	
	// Show loading bar during auth check
	$effect(() => {
		if ($isLoading) {
			loadingStore.start();
		} else {
			loadingStore.stop();
		}
	});
	
	// Keep one realtime connection up for the whole signed-in session. Cached
	// data is marked stale the moment it changes on the server — even for pages
	// that are not open — so going back to a page shows it instantly and current.
	// An account still on its starting password cannot reach the API yet.
	$effect(() => {
		if (!$isAuthenticated || $authStore.user?.mustChangePassword) return;

		startRealtime();
		return () => stopRealtime();
	});

	// Simple redirect to login if not authenticated
	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(`/auth/login?redirect=${encodeURIComponent($page.url.pathname)}`);
		}
	});
</script>

{#if $isAuthenticated && $authStore.user?.mustChangePassword}
	<!-- An account on its starting password chooses its own before the app loads. -->
	<ForcePasswordChange user={$authStore.user} />
{:else if $isAuthenticated}
	{@render children()}
{/if}

<!-- Toast Container - Always rendered for protected routes -->
<ToastContainer />

<!-- Confirmation Dialog Container - Always rendered for protected routes -->
<ConfirmDialogContainer />
