<script lang="ts">
	import type { DonationRecord } from '$lib/api/analyticsReports';
	import { Heart, ChevronLeft, ChevronRight, Search } from 'lucide-svelte';

	interface Props {
		donations: DonationRecord[];
		/** Rows shown before pagination kicks in. */
		pageSize?: number;
	}
	let { donations, pageSize = 10 }: Props = $props();

	let page = $state(1);
	let search = $state('');

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return donations;
		return donations.filter(
			(d) =>
				d.donorName.toLowerCase().includes(q) ||
				d.itemName.toLowerCase().includes(q) ||
				(d.receiptNumber ?? '').toLowerCase().includes(q)
		);
	});

	const totalUnits = $derived(filtered.reduce((s, d) => s + (d.quantity || 0), 0));
	const uniqueDonors = $derived(new Set(filtered.map((d) => d.donorName)).size);

	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const paged = $derived(filtered.slice((page - 1) * pageSize, page * pageSize));

	// Reset to the first page whenever the search narrows the list.
	$effect(() => {
		search;
		page = 1;
	});
	$effect(() => {
		if (page > totalPages) page = totalPages;
	});

	function fmtDate(iso?: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h3 class="text-lg font-semibold text-gray-900">Donor Contributions</h3>
			<p class="mt-0.5 text-sm text-gray-500">Item donations received from donors and organizations</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<span class="inline-flex rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700 ring-1 ring-pink-600/10">
				Donors: {uniqueDonors}
			</span>
			<span class="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/10">
				Units received: {totalUnits}
			</span>
		</div>
	</div>

	{#if donations.length > 0}
		<div class="relative mt-4 max-w-xs">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
			<input
				type="text"
				bind:value={search}
				placeholder="Search donor, item, receipt…"
				class="w-full rounded-lg border border-gray-200 bg-white py-2 pr-4 pl-10 text-sm focus:border-pink-500 focus:outline-none"
			/>
		</div>
	{/if}

	<div class="mt-4 overflow-x-auto rounded-xl border border-gray-200">
		<table class="min-w-full divide-y divide-gray-200 text-left text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Donor</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Item</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Quantity</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Purpose / Notes</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Receipt</th>
					<th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Date</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if filtered.length === 0}
					<tr>
						<td colspan="6" class="px-4 py-12 text-center">
							<div class="flex flex-col items-center justify-center">
								<div class="mb-2 rounded-full bg-gray-100 p-3 text-gray-400">
									<Heart class="h-6 w-6" />
								</div>
								<p class="font-medium text-gray-900">
									{donations.length === 0 ? 'No donations recorded' : 'No matching donations'}
								</p>
								<p class="mt-1 text-xs text-gray-600">
									{donations.length === 0
										? 'Item donations logged in the selected period will appear here.'
										: 'Try a different donor, item, or receipt number.'}
								</p>
							</div>
						</td>
					</tr>
				{:else}
					{#each paged as d (d.id)}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3">
								<div class="font-semibold text-gray-900">{d.donorName}</div>
								<div class="text-xs text-gray-500">
									{d.inventoryAction === 'new_item' ? 'New item donated' : 'Added to existing stock'}
								</div>
							</td>
							<td class="px-4 py-3 text-sm text-gray-700">{d.itemName}</td>
							<td class="px-4 py-3 text-sm font-bold text-emerald-700">
								+{d.quantity}{d.unit ? ` ${d.unit}` : ''}
							</td>
							<td class="px-4 py-3 text-sm text-gray-600">
								{#if d.purpose}
									<div class="text-gray-800">{d.purpose}</div>
								{/if}
								{#if d.notes}
									<div class="mt-0.5 text-xs text-gray-500">{d.notes}</div>
								{/if}
								{#if !d.purpose && !d.notes}
									<span class="text-gray-400 italic">No details provided</span>
								{/if}
							</td>
							<td class="px-4 py-3 font-mono text-xs text-gray-500">{d.receiptNumber || '—'}</td>
							<td class="px-4 py-3 text-sm text-gray-600">{fmtDate(d.date ?? d.createdAt)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<div class="mt-3 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2">
			<p class="text-xs text-gray-600">
				Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
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
