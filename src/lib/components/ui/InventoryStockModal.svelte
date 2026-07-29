<script lang="ts">
	import type { InventoryItem } from '$lib/api/inventory';
	import { Package, CircleCheck, Search, X } from 'lucide-svelte';

	interface Props {
		items: InventoryItem[];
		/** 'total' = owned by lab · 'available' = in stock · 'flow' = available vs out. */
		mode: 'total' | 'available' | 'flow';
		onClose: () => void;
	}
	let { items, mode, onClose }: Props = $props();

	let search = $state('');

	const owned = (i: InventoryItem) => i.currentCount ?? i.quantity + (i.donations ?? 0);
	const available = (i: InventoryItem) => i.available ?? i.quantity + (i.donations ?? 0);
	const out = (i: InventoryItem) => i.released ?? 0;

	const rows = $derived.by(() => {
		const active = items.filter((i) => !i.archived);
		const q = search.trim().toLowerCase();
		const filtered = !q
			? active
			: active.filter(
					(i) =>
						i.name.toLowerCase().includes(q) ||
						(i.specification || '').toLowerCase().includes(q) ||
						(i.category || '').toLowerCase().includes(q)
				);
		// Sort by the metric this modal is about, descending.
		return [...filtered].sort((a, b) =>
			mode === 'total' ? owned(b) - owned(a) : mode === 'flow' ? out(b) - out(a) || available(b) - available(a) : available(b) - available(a)
		);
	});
	const totalMetric = $derived(rows.reduce((s, i) => s + (mode === 'total' ? owned(i) : available(i)), 0));
	const totalAvailable = $derived(rows.reduce((s, i) => s + available(i), 0));
	const totalOut = $derived(rows.reduce((s, i) => s + out(i), 0));

	const heading = $derived(
		mode === 'total' ? 'Total Lab Stock' : mode === 'available' ? 'Physical Available' : 'Stock Flow Balance'
	);
	const subtitle = $derived(
		mode === 'total'
			? 'Every item owned by the lab and how many are held.'
			: mode === 'available'
				? 'Items physically available inside the laboratory space.'
				: 'Available vs. checked-out across every item.'
	);
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={onClose} aria-hidden="true"></div>

	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div role="dialog" aria-modal="true" class="animate-scaleIn relative w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
			<!-- Header -->
			<div class="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
				<div class="flex min-w-0 items-start gap-3">
					<div class="mt-0.5 rounded-xl p-2.5 {mode === 'total' ? 'bg-indigo-100 text-indigo-600' : mode === 'available' ? 'bg-emerald-100 text-emerald-600' : 'bg-teal-100 text-teal-600'}">
						{#if mode === 'available'}<CircleCheck class="h-5 w-5" />{:else}<Package class="h-5 w-5" />{/if}
					</div>
					<div class="min-w-0">
						<h2 class="text-lg font-bold text-gray-900">{heading}</h2>
						<p class="text-xs text-gray-500">{subtitle}</p>
					</div>
				</div>
				<button type="button" onclick={onClose} class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="Close"><X class="h-5 w-5" /></button>
			</div>

			<div class="space-y-4 px-5 py-4 sm:px-6">
				<!-- Summary + search -->
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex gap-3">
						{#if mode === 'flow'}
							<div class="rounded-xl bg-emerald-50 px-4 py-2 text-center">
								<p class="text-lg font-bold text-emerald-700">{totalAvailable}</p>
								<p class="text-[10px] font-medium uppercase tracking-wide text-emerald-600">Available</p>
							</div>
							<div class="rounded-xl bg-blue-50 px-4 py-2 text-center">
								<p class="text-lg font-bold text-blue-700">{totalOut}</p>
								<p class="text-[10px] font-medium uppercase tracking-wide text-blue-600">Out</p>
							</div>
						{:else}
							<div class="rounded-xl px-4 py-2 text-center {mode === 'total' ? 'bg-indigo-50' : 'bg-emerald-50'}">
								<p class="text-lg font-bold {mode === 'total' ? 'text-indigo-700' : 'text-emerald-700'}">{totalMetric}</p>
								<p class="text-[10px] font-medium uppercase tracking-wide {mode === 'total' ? 'text-indigo-600' : 'text-emerald-600'}">{mode === 'total' ? 'Total owned' : 'Available'}</p>
							</div>
						{/if}
						<div class="rounded-xl bg-gray-50 px-4 py-2 text-center">
							<p class="text-lg font-bold text-gray-900">{rows.length}</p>
							<p class="text-[10px] font-medium uppercase tracking-wide text-gray-500">Items</p>
						</div>
					</div>
					<div class="relative max-w-xs flex-1">
						<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
						<input type="text" bind:value={search} placeholder="Search item, spec, category…" class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:outline-none" />
					</div>
				</div>

				<!-- Table -->
				<div class="max-h-[52vh] overflow-y-auto rounded-xl border border-gray-200">
					{#if rows.length === 0}
						<div class="px-6 py-16 text-center">
							<Package class="mx-auto h-10 w-10 text-gray-300" />
							<p class="mt-3 text-sm font-semibold text-gray-700">No items found</p>
							<p class="mt-1 text-xs text-gray-500">Nothing matches your search.</p>
						</div>
					{:else}
						<table class="min-w-full divide-y divide-gray-200 text-left text-xs sm:text-sm">
							<thead class="sticky top-0 bg-gray-50">
								<tr>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Item</th>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Category</th>
									<th class="px-4 py-2.5 text-right font-semibold uppercase tracking-wider {mode === 'total' ? 'text-indigo-700' : 'text-gray-700'}">Owned</th>
									<th class="px-4 py-2.5 text-right font-semibold uppercase tracking-wider {mode === 'available' || mode === 'flow' ? 'text-emerald-700' : 'text-gray-700'}">Available</th>
									<th class="px-4 py-2.5 text-right font-semibold uppercase tracking-wider {mode === 'flow' ? 'text-blue-700' : 'text-gray-700'}">Out</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each rows as i (i.id)}
									<tr class="transition-colors hover:bg-gray-50/60">
										<td class="px-4 py-3">
											<div class="font-medium text-gray-900">{i.name}</div>
											<div class="text-xs text-gray-500">{i.specification || i.category || ''}</div>
										</td>
										<td class="px-4 py-3 text-gray-700">{i.category || '—'}</td>
										<td class="px-4 py-3 text-right font-semibold {mode === 'total' ? 'text-indigo-700' : 'text-gray-900'}">{owned(i)}</td>
										<td class="px-4 py-3 text-right font-semibold {mode === 'available' ? 'text-emerald-700' : 'text-gray-900'}">{available(i)}</td>
										<td class="px-4 py-3 text-right {out(i) > 0 ? 'font-semibold text-blue-600' : 'text-gray-400'}">{out(i)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-200 px-5 py-4 sm:px-6">
				<div class="flex justify-end">
					<button type="button" onclick={onClose} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95">Close</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes scaleIn {
		from { opacity: 0; transform: scale(0.97); }
		to { opacity: 1; transform: scale(1); }
	}
	.animate-scaleIn { animation: scaleIn 0.2s ease-out; }
</style>
