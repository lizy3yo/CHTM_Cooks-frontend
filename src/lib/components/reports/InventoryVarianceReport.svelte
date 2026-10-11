<script lang="ts">
	/**
	 * Inventory Variance (Inventory tab).
	 *
	 * Over: stock gained this month and where it came from.
	 * Under: units that are not on the shelf and who has or owes them.
	 *
	 * Each month starts from a closed count: Over is absorbed into it and
	 * begins empty again, while Under keeps running until every unit is back.
	 */
	import { untrack } from 'svelte';
	import { Search, Download, AlertCircle, ChevronLeft, ChevronRight, Scale, TriangleAlert } from 'lucide-svelte';
	import {
		inventoryReportsAPI,
		type InventoryVarianceReport,
		type VarianceOverEntry,
		type VarianceUnderEntry
	} from '$lib/api/inventoryReports';
	import { downloadVarianceExcel, OVER_SOURCE_LABEL, UNDER_KIND_LABEL } from '$lib/utils/inventoryReportsExcel';
	import { toastStore } from '$lib/stores/toast';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	interface Props {
		/** Changes whenever the surrounding report reloads, so this reloads with it. */
		refreshKey?: string | number | null;
		userName: string;
	}

	let { refreshKey = null, userName }: Props = $props();

	const PAGE_SIZE = 10;

	function currentMonth(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	let month = $state(currentMonth());
	let tab = $state<'over' | 'under'>('under');
	let report = $state.raw<InventoryVarianceReport | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let search = $state('');
	let page = $state(1);
	let exporting = $state(false);

	let loadSeq = 0;
	async function load(): Promise<void> {
		const seq = ++loadSeq;
		error = null;
		try {
			const data = await inventoryReportsAPI.variance(month);
			if (seq !== loadSeq) return;
			report = data;
		} catch (err) {
			if (seq !== loadSeq) return;
			error = err instanceof Error ? err.message : 'Failed to load the inventory variance.';
		} finally {
			if (seq === loadSeq) loading = false;
		}
	}

	$effect(() => {
		void month;
		void refreshKey;
		untrack(() => {
			page = 1;
			void load();
		});
	});

	$effect(() => {
		void search;
		void tab;
		untrack(() => (page = 1));
	});

	function shiftMonth(delta: number): void {
		const [y, m] = month.split('-').map(Number);
		const d = new Date(y, m - 1 + delta, 1);
		const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		if (next <= currentMonth()) month = next;
	}

	function matches(entry: VarianceOverEntry | VarianceUnderEntry, q: string): boolean {
		return `${entry.itemName} ${entry.category ?? ''} ${entry.person ?? ''} ${entry.reference ?? ''} ${entry.reason ?? ''}`
			.toLowerCase()
			.includes(q);
	}

	const rows = $derived.by(() => {
		const source: Array<VarianceOverEntry | VarianceUnderEntry> = (tab === 'over' ? report?.over : report?.under) ?? [];
		const q = search.trim().toLowerCase();
		return q ? source.filter((e) => matches(e, q)) : source;
	});
	const totalPages = $derived(Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
	const pageRows = $derived(rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	const SOURCE_STYLE: Record<VarianceOverEntry['source'], string> = {
		donation: 'bg-blue-100 text-blue-800',
		replacement_surplus: 'bg-violet-100 text-violet-800',
		over_return: 'bg-violet-100 text-violet-800',
		adjustment: 'bg-gray-100 text-gray-700'
	};

	const KIND_STYLE: Record<VarianceUnderEntry['kind'], string> = {
		unreturned: 'bg-red-100 text-red-800',
		damaged: 'bg-amber-100 text-amber-800',
		missing: 'bg-red-100 text-red-800',
		adjustment: 'bg-gray-100 text-gray-700'
	};

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function days(n: number): string {
		return `${n} day${n === 1 ? '' : 's'}`;
	}

	/** One line saying where an Over entry came from. */
	function overDetail(e: VarianceOverEntry): string {
		const parts: string[] = [];
		if (e.source === 'donation') parts.push(`Donated by ${e.person ?? 'unknown donor'}`);
		else if (e.source === 'adjustment') parts.push(`Added by ${e.person ?? 'staff'}`);
		else parts.push(e.person ?? 'Unknown borrower');
		parts.push(fmtDate(e.date));
		if (e.reference) parts.push(e.reference);
		if (e.reason) parts.push(e.reason);
		return parts.join(' · ');
	}

	/** One line saying who is responsible for an Under entry and why. */
	function underDetail(e: VarianceUnderEntry): string {
		const parts: string[] = [e.kind === 'adjustment' ? `Removed by ${e.person ?? 'staff'}` : (e.person ?? 'Unknown borrower')];
		if (e.reference) parts.push(e.reference);
		if (e.reason) parts.push(e.reason);
		if (e.dueDate) parts.push(`${e.kind === 'unreturned' ? 'due' : 'replacement due'} ${fmtDate(e.dueDate)}`);
		if (e.noticeSent) parts.push('disciplinary notice sent');
		if (e.carriedFrom) parts.push(`carried from ${e.carriedFrom}`);
		return parts.join(' · ');
	}

	function underBadge(e: VarianceUnderEntry): string {
		if (e.kind === 'unreturned') {
			return e.daysOverdue ? `Unreturned · ${days(e.daysOverdue)} overdue` : `Out on loan · ${days(e.daysOutstanding)}`;
		}
		if (e.kind === 'adjustment') return UNDER_KIND_LABEL.adjustment;
		return `${UNDER_KIND_LABEL[e.kind]} · ${days(e.daysOutstanding)}`;
	}

	async function exportExcel(): Promise<void> {
		if (!report) return;
		exporting = true;
		try {
			await downloadVarianceExcel(report, userName);
		} catch (err) {
			console.error('[Inventory Variance] Export failed:', err);
			toastStore.error('Could not create the Excel file.', 'Export failed');
		} finally {
			exporting = false;
		}
	}
</script>

<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="variance-title">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h3 id="variance-title" class="flex items-center gap-2 text-lg font-semibold text-gray-900">
				<Scale size={18} class="text-pink-600" /> Inventory Variance
			</h3>
			<p class="mt-1 text-sm text-gray-600">
				What was gained this month and where it came from, and what is not on the shelf and who has it.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<div class="inline-flex items-center rounded-lg border border-gray-200 bg-white">
				<button type="button" onclick={() => shiftMonth(-1)} class="rounded-l-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50" aria-label="Previous month">
					<ChevronLeft size={16} />
				</button>
				<input
					type="month"
					bind:value={month}
					max={currentMonth()}
					aria-label="Month"
					class="border-x border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:outline-none"
				/>
				<button
					type="button"
					onclick={() => shiftMonth(1)}
					disabled={month >= currentMonth()}
					class="rounded-r-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
					aria-label="Next month"
				>
					<ChevronRight size={16} />
				</button>
			</div>
			<button
				type="button"
				onclick={exportExcel}
				disabled={exporting || !report}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
			>
				<Download size={13} />
				{exporting ? 'Exporting…' : 'Export Excel'}
			</button>
		</div>
	</div>

	{#if loading && !report}
		<div class="mt-4 animate-pulse space-y-3">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">{#each Array(3) as _}<div class="h-20 rounded-xl bg-gray-100"></div>{/each}</div>
			{#each Array(4) as _}<div class="h-14 rounded-lg bg-gray-100"></div>{/each}
		</div>
	{:else if error && !report}
		<div class="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			<AlertCircle size={16} class="shrink-0" />
			<span class="flex-1">{error}</span>
			<button type="button" onclick={load} class="font-semibold underline hover:no-underline">Retry</button>
		</div>
	{:else if report}
		<dl class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
			<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
				<dt class="text-sm text-gray-600">Starting count, {report.monthLabel}</dt>
				<dd class="mt-1 text-2xl font-bold text-gray-900">
					{report.summary.startingCount === null ? '—' : report.summary.startingCount.toLocaleString()}
				</dd>
				<p class="mt-1 text-xs text-gray-500">
					{#if report.summary.startingCount === null}
						Counting starts with the first month-end closing.
					{:else if report.summary.isRestart}
						Counts were restarted on {fmtDate(report.summary.startedAt)}.
					{:else}
						Set when the previous month was closed.
					{/if}
				</p>
			</div>
			<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
				<dt class="text-sm text-emerald-800">Over this month</dt>
				<dd class="mt-1 text-2xl font-bold text-emerald-700">+{report.summary.overUnits.toLocaleString()}</dd>
				<p class="mt-1 text-xs text-emerald-800">
					{#if report.closing}
						Added to the next starting count on {fmtDate(report.closing.closedAt)}.
					{:else}
						Becomes part of next month's starting count.
					{/if}
				</p>
			</div>
			<div class="rounded-xl border border-red-200 bg-red-50 p-4">
				<dt class="text-sm text-red-800">{report.isCurrentMonth ? 'Under, still open' : 'Under carried forward'}</dt>
				<dd class="mt-1 text-2xl font-bold text-red-700">
					−{(report.isCurrentMonth ? report.summary.underOpenUnits : (report.closing?.underCarried ?? 0)).toLocaleString()}
				</dd>
				<p class="mt-1 text-xs text-red-800">Stays on the list until every unit is back or replaced.</p>
			</div>
		</dl>

		{#if report.unexplained.length}
			<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" role="status">
				<p class="flex items-center gap-2 text-sm font-semibold text-amber-900">
					<TriangleAlert size={16} class="shrink-0" />
					{report.unexplained.length} item{report.unexplained.length === 1 ? '' : 's'} need a recount
				</p>
				<p class="mt-1 text-xs text-amber-800">
					The count changed without a donation, loan, replacement or stock adjustment on record.
				</p>
				<ul class="mt-2 flex flex-wrap gap-1.5 text-xs">
					{#each report.unexplained.slice(0, 12) as u (u.itemId)}
						<li class="rounded-full bg-white px-2.5 py-1 font-medium text-amber-900 ring-1 ring-amber-200">
							{u.itemName}
							<span class="font-bold">{u.difference > 0 ? '+' : '−'}{Math.abs(u.difference)}</span>
						</li>
					{/each}
					{#if report.unexplained.length > 12}
						<li class="px-1 py-1 text-amber-800">and {report.unexplained.length - 12} more in the Excel export</li>
					{/if}
				</ul>
			</div>
		{/if}

		<div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="tablist" aria-label="Variance type">
				{#each [{ id: 'under', label: 'Under', count: report.under.length }, { id: 'over', label: 'Over', count: report.over.length }] as opt (opt.id)}
					<button
						type="button"
						role="tab"
						aria-selected={tab === opt.id}
						onclick={() => (tab = opt.id as 'over' | 'under')}
						class="rounded-md px-4 py-1.5 text-sm font-medium transition {tab === opt.id
							? 'bg-white text-pink-700 shadow-sm'
							: 'text-gray-600 hover:text-gray-900'}"
					>
						{opt.label} ({opt.count})
					</button>
				{/each}
			</div>
			<div class="relative sm:w-72">
				<Search size={16} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
				<input
					type="search"
					bind:value={search}
					placeholder="Search item, person or reference"
					aria-label="Search variance entries"
					class="h-10 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-9 text-sm placeholder-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-100 focus:outline-none"
				/>
			</div>
		</div>

		<p class="mt-3 text-xs text-gray-500">
			{#if tab === 'over'}
				Stock gained in {report.monthLabel}. The list is cleared at month end, when these units join the starting count.
			{:else if report.isCurrentMonth}
				A running list. Each entry stays here, across months, until the units are returned or replaced.
			{:else}
				Stock removed by adjustment in {report.monthLabel}. Open loans and replacements are listed under the current month.
			{/if}
		</p>

		{#if rows.length === 0}
			<div class="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
				<p class="text-sm font-medium text-gray-700">
					{#if search}
						No entries match your search.
					{:else if tab === 'over'}
						Nothing was added in {report.monthLabel}.
					{:else}
						Nothing is missing from the shelf.
					{/if}
				</p>
			</div>
		{:else}
			<ul class="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
				{#each pageRows as entry (entry.id)}
					<li class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_4rem_minmax(0,1fr)]">
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-gray-900" title={entry.itemName}>{entry.itemName}</p>
							<p class="truncate text-xs text-gray-500">{entry.category ?? 'Uncategorized'}</p>
						</div>
						<p class="text-right text-base font-bold tabular-nums sm:text-left {tab === 'over' ? 'text-emerald-700' : 'text-red-700'}">
							{tab === 'over' ? '+' : '−'}{entry.quantity}
						</p>
						<div class="col-span-2 min-w-0 sm:col-span-1">
							{#if tab === 'over'}
								{@const e = entry as VarianceOverEntry}
								<span class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold {SOURCE_STYLE[e.source]}">
									{OVER_SOURCE_LABEL[e.source]}
								</span>
								<p class="mt-1 text-xs text-gray-600">{overDetail(e)}</p>
							{:else}
								{@const e = entry as VarianceUnderEntry}
								<span class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold {KIND_STYLE[e.kind]}">
									{underBadge(e)}
								</span>
								<p class="mt-1 text-xs text-gray-600">{underDetail(e)}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>

			{#if totalPages > 1}
				<Pagination currentPage={page} {totalPages} totalItems={rows.length} itemsPerPage={PAGE_SIZE} onPageChange={(p) => (page = p)} class="mt-4" />
			{/if}
		{/if}
	{/if}
</section>
