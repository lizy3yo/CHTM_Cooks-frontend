<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import SupervisorSidebar from '$lib/components/supervisor/SupervisorSidebar.svelte';
	import SupervisorTopNav from '$lib/components/supervisor/SupervisorTopNav.svelte';
	import SupervisorBottomNav from '$lib/components/supervisor/SupervisorBottomNav.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
	import { sidebarCollapsed } from '$lib/stores/superadmin';
	import { authStore, user, isLoading } from '$lib/stores/auth';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();

	onMount(() => {
		void authStore.verifySession();
	});

	// Redirect back if user is not a supervisor
	$effect(() => {
		if (!$isLoading && $user && $user.role !== 'supervisor') {
			goto('/');
		}
	});
</script>

{#if $user && $user.role === 'supervisor'}
<div class="flex min-h-screen bg-white">
	<SupervisorSidebar />
	
	<!-- Main Content -->
	<main class="min-w-0 flex-1 overflow-x-hidden bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 pt-5 pb-6 sm:px-6 lg:px-8 lg:pt-6">
			{@render children()}
		</div>
	</main>
</div>

<SupervisorTopNav />
<SupervisorBottomNav />
<ToastContainer />
<ConfirmDialogContainer />
{/if}
