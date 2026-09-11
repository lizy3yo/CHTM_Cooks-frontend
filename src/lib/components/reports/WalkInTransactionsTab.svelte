<script lang="ts">
	import { Users, Search } from 'lucide-svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
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

	// ─── Pagination (10 per page) ───
	const PAGE_SIZE = 10;
	let page = $state(1);
	const totalPages = $derived(Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
	const pagedRows = $derived(rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	// Back to page 1 when the search or the report data changes.
	$effect(() => {
		search;
		data;
		page = 1;
	});

	// ─── Display helpers ───
	// Registered students are stored with their numeric account id and their school email.
	function isRegistered(w: WalkInReportTransaction): boolean {
		return /^\d+$/.test(w.studentId) && Boolean(w.email);
	}

	// School email for students; guest ID and email for guests. Never the internal account id.
	function personLine(w: WalkInReportTransaction): string {
		if (isRegistered(w)) return w.email;
		const guestId = w.studentId && w.studentId !== 'GUEST' ? w.studentId : '';
		return ['Guest', guestId, w.email].filter(Boolean).join(' · ');
	}

	function classLabel(w: WalkInReportTransaction): string {
		if (w.classCode && w.classCode !== 'N/A (Guest)') return w.classCode;
		return isRegistered(w) ? '—' : 'Guest';
	}

	// "Sep 11 – Sep 13, 2026", or both years when the range crosses a year.
	function dateRange(from: string | null | undefined, to: string | null | undefined): string {
		if (!from && !to) return '—';
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
		if (!from || !to) return new Date((from || to) as string).toLocaleDateString('en-US', opts);
		const a = new Date(from);
		const b = new Date(to);
		const sameYear = a.getFullYear() === b.getFullYear();
		const start = a.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : opts);
		return `${start} – ${b.toLocaleDateString('en-US', opts)}`;
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
					{#each pagedRows as w (w.id)}
						<tr class="align-top hover:bg-gray-50/60">
							<td class="px-4 py-3">
								<div class="font-medium text-gray-900">{w.studentName || 'Unknown'}</div>
								<div class="text-xs text-gray-500">{personLine(w)}</div>
							</td>
							<td class="px-4 py-3">
								{#if classLabel(w) === 'Guest'}
									<span
										class="inline-block rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500"
										>Guest</span
									>
								{:else}
									<span class="font-mono text-xs font-semibold text-gray-700">{classLabel(w)}</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-xs text-gray-600">
								{w.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
							</td>
							<td class="px-4 py-3 text-xs whitespace-nowrap text-gray-600">
								{dateRange(w.borrowDate, w.returnDate)}
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

		{#if totalPages > 1}
			<Pagination
				currentPage={page}
				{totalPages}
				totalItems={rows.length}
				itemsPerPage={PAGE_SIZE}
				onPageChange={(p) => (page = p)}
			/>
		{/if}
	{/if}
</div>
