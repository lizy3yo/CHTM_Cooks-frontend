<script lang="ts">
	import { Users, Search } from 'lucide-svelte';
	import type { WalkInSummary, WalkInReportTransaction } from '$lib/api/analyticsReports';

	interface Props {
		data?: { summary: WalkInSummary; transactions: WalkInReportTransaction[] } | null;
	}
	let { data = null }: Props = $props();

	let search = $state('');

	const stats = $derived(
		data?.summary ?? { total: 0, out: 0, returned: 0, issues: 0, itemsOut: 0, uniquePeople: 0 }
	);

	const rows = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const all = data?.transactions ?? [];
		if (!q) return all;
		return all.filter(
			(w) =>
				w.studentName.toLowerCase().includes(q) ||
				w.studentId.toLowerCase().includes(q) ||
				w.classCode.toLowerCase().includes(q) ||
				w.items.some((i) => i.name.toLowerCase().includes(q))
		);
	});

	function fmt(d: string | null | undefined): string {
		return d ? (d ?? '').slice(0, 10) : '—';
	}
</script>

<div class="space-y-5 p-6">
	<p class="text-xs text-gray-500">
		Walk-in (alternative) transactions recorded at the custodian desk. Anyone can be a walk-in
		borrower — registered or not. Scoped to the selected time period.
	</p>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl border border-gray-200 bg-white p-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Total</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
		</div>
		<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Currently Out</p>
			<p class="mt-1 text-2xl font-bold text-amber-700">{stats.out}</p>
		</div>
		<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">Returned</p>
			<p class="mt-1 text-2xl font-bold text-emerald-700">{stats.returned}</p>
		</div>
		<div class="rounded-xl border border-rose-200 bg-rose-50 p-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-rose-700">Issues</p>
			<p class="mt-1 text-2xl font-bold text-rose-700">{stats.issues}</p>
		</div>
	</div>

	<div class="relative max-w-md">
		<Search
			class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
		/>
		<input
			type="text"
			bind:value={search}
			placeholder="Search person, ID, class, or item…"
			class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:outline-none"
		/>
	</div>

	{#if rows.length === 0}
		<div class="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center">
			<Users class="mx-auto h-10 w-10 text-gray-300" />
			<p class="mt-3 text-sm font-semibold text-gray-700">No walk-in transactions</p>
			<p class="mt-1 text-xs text-gray-500">
				Nothing recorded for this time period{search ? ' matching your search' : ''}.
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-gray-200">
			<table class="min-w-full divide-y divide-gray-200 text-left text-sm">
				<thead
					class="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500"
				>
					<tr>
						<th class="px-4 py-3">Person</th>
						<th class="px-4 py-3">Class</th>
						<th class="px-4 py-3">Items</th>
						<th class="px-4 py-3">Dates</th>
						<th class="px-4 py-3">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					{#each rows as w (w.id)}
						<tr class="hover:bg-gray-50/60">
							<td class="px-4 py-3">
								<div class="font-medium text-gray-900">{w.studentName || 'Unknown'}</div>
								<div class="text-xs text-gray-500">{w.studentId || '—'}</div>
							</td>
							<td class="px-4 py-3 text-gray-700">{w.classCode || '—'}</td>
							<td class="px-4 py-3 text-xs text-gray-600">
								{w.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
							</td>
							<td class="px-4 py-3 text-xs text-gray-600">
								{fmt(w.borrowDate)} → {fmt(w.returnDate)}
							</td>
							<td class="px-4 py-3">
								<span
									class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset {w.status ===
									'borrowed'
										? 'bg-amber-50 text-amber-700 ring-amber-600/10'
										: w.status === 'returned'
											? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
											: 'bg-rose-50 text-rose-700 ring-rose-600/10'}"
								>
									{w.status === 'borrowed'
										? 'Out'
										: w.status === 'returned'
											? 'Returned'
											: 'Issue'}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
