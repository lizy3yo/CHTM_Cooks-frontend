<script lang="ts">
	import { page } from '$app/stores';

	const isAdminRoute = $derived($page.url.pathname.startsWith('/admin'));

	const items = [
		{
			name: 'Dashboard',
			href: '/admin/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Inventory',
			href: '/admin/inventory',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
		},
		{
			name: 'Transactions',
			href: '/admin/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
		},
		{
			name: 'Analytics',
			href: '/admin/analytics',
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
		}
	] as const;

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
</script>

{#if isAdminRoute}
<nav
	class="fixed inset-x-0 bottom-0 z-40 flex h-16 items-end border-t border-gray-200 bg-white pb-safe lg:hidden"
	aria-label="Bottom navigation"
>
	{#each items as item}
		{@const active = isActive(item.href)}

		<a
			href={item.href}
			class="flex flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2 text-xs font-medium transition-colors duration-200
				{active ? 'text-pink-600' : 'text-gray-400 hover:text-gray-600'}"
			aria-current={active ? 'page' : undefined}
		>
			<svg
				class="h-5 w-5 transition-transform duration-200 {active ? 'scale-110' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="{active ? 2.5 : 2}" d={item.icon} />
			</svg>
			<span>{item.name}</span>

			{#if active}
				<span class="absolute bottom-1 h-1 w-1 rounded-full bg-pink-600"></span>
			{/if}
		</a>
	{/each}
</nav>

<!-- Spacer so page content isn't hidden behind the bottom nav -->
<div class="h-16 lg:hidden"></div>
{/if}
