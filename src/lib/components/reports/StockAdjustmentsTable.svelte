<script lang="ts">
	import type { StockAdjustmentEntry } from '$lib/api/analyticsReports';
	import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-svelte';

	interface Props {
		adjustments: StockAdjustmentEntry[];
		/** Rows shown before pagination kicks in. */
		pageSize?: number;
	}
	let { adjustments, pageSize = 10 }: Props = $props();

	let page = $state(1);

	const restocked = $derived(adjustments.filter((a) => a.quantity > 0).length);
	const lossDamage = $derived(adjustments.filter((a) => a.quantity < 0).reduce((s, a) => s + a.quantity, 0));

	const totalPages = $derived(Math.max(1, Math.ceil(adjustments.length / pageSize)));
	const paged = $derived(adjustments.slice((page - 1) * pageSize, page * pageSize));

	// Snap back into range when the underlying data shrinks (filter/period change).
	$effect(() => {
		if (page > totalPages) page = totalPages;
	});

	const genericReasons = ['Manual Stock Restock', 'Manual Stock Damage/Loss'];
	function fmtDate(iso?: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h3 class="text-lg font-semibold text-gray-900">Stock Adjustment Activity</h3>
			<p class="mt-0.5 text-sm text-gray-500">Manual inventory corrections by custodians</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<span class="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/10">
				Restocked: {restocked}
			</span>
			<span class="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/10">
				Loss/Damage: {lossDamage}
			</span>
		</div>
	</div>

	<div class="mt-4 overflow-x-auto rounded-xl border border-gray-200">
		<table class="min-w-full divide-y divide-gray-200 text-left text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Item</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Type</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Quantity</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Reason / Notes</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Date</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if adjustments.length === 0}
					<tr>
						<td colspan="5" class="px-4 py-12 text-center">
							<div class="flex flex-col items-center justify-center">
								<div class="mb-2 rounded-full bg-gray-100 p-3 text-gray-400">
									<ClipboardList class="h-6 w-6" />
								</div>
								<p class="font-medium text-gray-900">No stock adjustments logged</p>
								<p class="mt-1 text-xs text-gray-600">Manual inventory adjustments will appear here in the selected period.</p>
							</div>
						</td>
					</tr>
				{:else}
					{#each paged as adj (adj.id)}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 text-sm font-semibold text-gray-900">{adj.itemName}</td>
							<td class="px-4 py-3 text-sm">
								<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {adj.quantity > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
									{adj.quantity > 0 ? 'Restock' : 'Loss/Damage'}
								</span>
							</td>
							<td class="px-4 py-3 text-sm font-bold {adj.quantity > 0 ? 'text-emerald-700' : 'text-rose-700'}">
								{adj.quantity > 0 ? '+' : ''}{adj.quantity}
							</td>
							<td class="px-4 py-3 text-sm text-gray-600">
								{#if adj.purpose && !genericReasons.includes(adj.purpose)}
									<div class="font-medium text-gray-800">{adj.purpose}</div>
									{#if adj.notes}<div class="mt-0.5 text-xs text-gray-500">{adj.notes}</div>{/if}
								{:else if adj.notes}
									<div class="text-gray-800">{adj.notes}</div>
								{:else}
									<span class="text-gray-400 italic">No reason provided</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm text-gray-600">{fmtDate(adj.createdAt ?? adj.date)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<div class="mt-3 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2">
			<p class="text-xs text-gray-600">
				Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, adjustments.length)} of {adjustments.length}
			</p>
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					onclick={() => (page = Math.max(1, page - 1))}
					disabled={page === 1}
					class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
					aria-label="Previous page"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<span class="px-2 text-xs font-semibold text-gray-700">{page} / {totalPages}</span>
				<button
					type="button"
					onclick={() => (page = Math.min(totalPages, page + 1))}
					disabled={page === totalPages}
					class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
					aria-label="Next page"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}
</div>
