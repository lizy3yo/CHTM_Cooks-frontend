<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';
	import AdminTopNav from '$lib/components/admin/AdminTopNav.svelte';
	import AdminBottomNav from '$lib/components/admin/AdminBottomNav.svelte';
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

	// Redirect back if user is not an admin
	$effect(() => {
		if (!$isLoading && $user && $user.role !== 'admin') {
			goto('/');
		}
	});
</script>

{#if $user && $user.role === 'admin'}
<div class="flex min-h-screen bg-white">
	<AdminSidebar />
	
	<!-- Main Content -->
	<main class="min-w-0 flex-1 overflow-x-hidden bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 pt-5 pb-6 sm:px-6 lg:px-8 lg:pt-6">
			{@render children()}
		</div>
	</main>
</div>

<AdminTopNav />
<AdminBottomNav />
<ToastContainer />
<ConfirmDialogContainer />
{/if}
