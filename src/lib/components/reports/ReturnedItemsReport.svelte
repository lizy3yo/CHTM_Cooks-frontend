<script lang="ts">
	/**
	 * Returned Items (Reports & Analytics tab).
	 *
	 * Every inspected line in the selected range: who had it, for how many
	 * days, and what came back good, damaged or missing, with the custodian's
	 * note and photos.
	 */
	import { untrack } from 'svelte';
	import { Search, Download, AlertCircle, PackageCheck, Camera, ChevronDown } from 'lucide-svelte';
	import { inventoryReportsAPI, type ReturnedItemRow, type ReturnedItemsReport } from '$lib/api/inventoryReports';
	import { downloadReturnedItemsExcel } from '$lib/utils/inventoryReportsExcel';
	import { toastStore } from '$lib/stores/toast';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import { opensDetail, DETAIL_HOVER } from './reportDetail.svelte';
	import { returnedItemDetail } from './reportDetailBuilders';

	interface Props {
		/** The report's selected range (yyyy-mm-dd); null means the current month. */
		range: { from: string; to: string } | null;
		rangeLabel: string;
		classCodeIds?: string[];
		studentIds?: string[];
		/** Changes whenever the surrounding report reloads, so this reloads with it. */
		refreshKey?: string | number | null;
		userName: string;
	}

	let { range, rangeLabel, classCodeIds = [], studentIds = [], refreshKey = null, userName }: Props = $props();

	const PAGE_SIZE = 10;

	type ConditionFilter = 'all' | 'issues' | 'damaged' | 'missing' | 'late';

	let report = $state.raw<ReturnedItemsReport | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let search = $state('');
	let condition = $state<ConditionFilter>('all');
	let page = $state(1);
	let exporting = $state(false);
	/** Row whose note and photos are expanded. */
	let openRow = $state<string | null>(null);

	const query = $derived({ ...(range ? { from: range.from, to: range.to } : {}), classCodeIds, studentIds });

	let loadSeq = 0;
	async function load(): Promise<void> {
		const seq = ++loadSeq;
		error = null;
		try {
			const data = await inventoryReportsAPI.returnedItems(query);
			if (seq !== loadSeq) return;
			report = data;
		} catch (err) {
			if (seq !== loadSeq) return;
			error = err instanceof Error ? err.message : 'Failed to load returned items.';
		} finally {
			if (seq === loadSeq) loading = false;
		}
	}

	$effect(() => {
		void query;
		void refreshKey;
		untrack(() => {
			page = 1;
			void load();
		});
	});

	const filtered = $derived.by(() => {
		let rows = report?.rows ?? [];
		if (condition === 'issues') rows = rows.filter((r) => r.damaged > 0 || r.missing > 0);
		else if (condition === 'damaged') rows = rows.filter((r) => r.damaged > 0);
		else if (condition === 'missing') rows = rows.filter((r) => r.missing > 0);
		else if (condition === 'late') rows = rows.filter((r) => r.daysLate > 0);

		const q = search.trim().toLowerCase();
		return q
			? rows.filter((r) => `${r.itemName} ${r.studentName} ${r.requestCode} ${r.remarks ?? ''}`.toLowerCase().includes(q))
			: rows;
	});
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	const pageRows = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	$effect(() => {
		void search;
		void condition;
		untrack(() => (page = 1));
	});

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function hasDetail(r: ReturnedItemRow): boolean {
		return !!r.remarks || r.photos.length > 0;
	}

	async function exportExcel(): Promise<void> {
		if (!report) return;
		exporting = true;
		try {
			await downloadReturnedItemsExcel(report, rangeLabel, userName);
		} catch (err) {
			console.error('[Returned Items] Export failed:', err);
			toastStore.error('Could not create the Excel file.', 'Export failed');
		} finally {
			exporting = false;
		}
	}
</script>

<section class="p-6" aria-labelledby="returned-items-title">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h3 id="returned-items-title" class="flex items-center gap-2 text-lg font-semibold text-gray-900">
				<PackageCheck size={18} class="text-pink-600" /> Returned Items
			</h3>
			<p class="mt-1 text-sm text-gray-600">
				What came back from each loan in <span class="font-medium text-gray-800">{rangeLabel}</span>: condition, days kept and the custodian's report.
			</p>
		</div>
		<button
			type="button"
			onclick={exportExcel}
			disabled={exporting || !report || report.rows.length === 0}
			class="inline-flex items-center gap-1.5 self-start rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
		>
			<Download size={13} />
			{exporting ? 'Exporting…' : 'Export Excel'}
		</button>
	</div>

	{#if loading && !report}
		<div class="mt-4 animate-pulse space-y-3">
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-6">{#each Array(6) as _}<div class="h-20 rounded-xl bg-gray-100"></div>{/each}</div>
			{#each Array(5) as _}<div class="h-12 rounded-lg bg-gray-100"></div>{/each}
		</div>
	{:else if error && !report}
		<div class="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			<AlertCircle size={16} class="shrink-0" />
			<span class="flex-1">{error}</span>
			<button type="button" onclick={load} class="font-semibold underline hover:no-underline">Retry</button>
		</div>
	{:else if report}
		{@const s = report.summary}
		<dl class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
			{#each [
				{ label: 'Requests returned', value: s.requests, cls: 'text-gray-900' },
				{ label: 'Good units', value: s.good, cls: 'text-emerald-700' },
				{ label: 'Damaged units', value: s.damaged, cls: s.damaged ? 'text-amber-700' : 'text-gray-900' },
				{ label: 'Missing units', value: s.missing, cls: s.missing ? 'text-red-700' : 'text-gray-900' },
				{ label: 'Returned late', value: s.lateRequests, cls: s.lateRequests ? 'text-red-700' : 'text-gray-900' },
				{ label: 'Average days kept', value: s.avgDaysKept ?? '—', cls: 'text-gray-900' }
			] as m (m.label)}
				<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
					<dt class="text-sm text-gray-600">{m.label}</dt>
					<dd class="mt-1 text-2xl font-bold {m.cls}">{m.value}</dd>
				</div>
			{/each}
		</dl>

		<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search size={16} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
				<input
					type="search"
					bind:value={search}
					placeholder="Search item, student or request"
					aria-label="Search returned items"
					class="h-10 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-9 text-sm placeholder-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-100 focus:outline-none"
				/>
			</div>
			<select bind:value={condition} aria-label="Filter by condition" class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
				<option value="all">All returns</option>
				<option value="issues">Damaged or missing</option>
				<option value="damaged">Damaged only</option>
				<option value="missing">Missing only</option>
				<option value="late">Returned late</option>
			</select>
		</div>

		{#if filtered.length === 0}
			<div class="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
				<p class="text-sm font-medium text-gray-700">
					{search || condition !== 'all' ? 'No returns match your filters.' : 'No items were returned in this period.'}
				</p>
			</div>
		{:else}
			<div class="mt-4 overflow-x-auto rounded-lg border border-gray-200">
				<table class="min-w-full divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
						<tr>
							<th scope="col" class="px-4 py-3">Returned</th>
							<th scope="col" class="px-4 py-3">Student</th>
							<th scope="col" class="px-4 py-3">Item</th>
							<th scope="col" class="px-4 py-3">Condition</th>
							<th scope="col" class="px-4 py-3 text-right">Days kept</th>
							<th scope="col" class="px-4 py-3">Report</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each pageRows as row (row.id)}
							<tr class="align-top {DETAIL_HOVER}" {...opensDetail(() => returnedItemDetail(row, report?.rows ?? []), `View details for ${row.itemName}`)}>
								<td class="px-4 py-3 whitespace-nowrap text-gray-700">
									{fmtDate(row.returnedAt)}
									<p class="font-mono text-xs text-gray-500">{row.requestCode}</p>
								</td>
								<td class="px-4 py-3 text-gray-900">{row.studentName}</td>
								<td class="px-4 py-3">
									<p class="font-medium text-gray-900">{row.itemName}</p>
									<p class="text-xs text-gray-500">{row.quantity} borrowed</p>
								</td>
								<td class="px-4 py-3">
									<div class="flex flex-wrap gap-1 text-xs font-semibold">
										<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Good {row.good}</span>
										{#if row.damaged > 0}
											<span class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Damaged {row.damaged}</span>
										{/if}
										{#if row.missing > 0}
											<span class="rounded-full bg-red-100 px-2 py-0.5 text-red-800">Missing {row.missing}</span>
										{/if}
										{#if row.over > 0}
											<span class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Extra +{row.over}</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-right whitespace-nowrap">
									<span class="font-medium text-gray-900">{row.daysKept === null ? '—' : `${row.daysKept} ${row.daysKept === 1 ? 'day' : 'days'}`}</span>
									{#if row.daysLate > 0}
										<p class="text-xs font-medium text-red-600">{row.daysLate} {row.daysLate === 1 ? 'day' : 'days'} late</p>
									{:else}
										<p class="text-xs text-emerald-600">On time</p>
									{/if}
								</td>
								<td class="px-4 py-3">
									<p class="text-xs text-gray-500">{row.inspectedBy ? `By ${row.inspectedBy}` : 'Inspector not recorded'}</p>
									{#if hasDetail(row)}
										<button
											type="button"
											onclick={(e) => {
												// The row itself opens the details window.
												e.stopPropagation();
												openRow = openRow === row.id ? null : row.id;
											}}
											aria-expanded={openRow === row.id}
											class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-pink-700 hover:text-pink-900"
										>
											{#if row.photos.length}<Camera size={13} /> {row.photos.length}{/if}
											{openRow === row.id ? 'Hide report' : 'View report'}
											<ChevronDown size={13} class="transition-transform {openRow === row.id ? 'rotate-180' : ''}" />
										</button>
									{/if}
								</td>
							</tr>
							{#if openRow === row.id}
								<tr class="bg-gray-50">
									<td colspan="6" class="px-4 py-3">
										{#if row.remarks}
											<p class="text-sm text-gray-800"><span class="font-semibold text-gray-500">Reason:</span> {row.remarks}</p>
										{/if}
										{#if row.photos.length}
											<div class="mt-2 flex flex-wrap gap-2">
												{#each row.photos as photo, i (photo)}
													<a href={photo} target="_blank" rel="noopener noreferrer" class="block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 hover:border-pink-400" title="Open photo {i + 1}">
														<img src={photo} alt="Damage to {row.itemName}, photo {i + 1}" class="h-full w-full object-cover" loading="lazy" />
													</a>
												{/each}
											</div>
										{/if}
										{#if row.replacementDue}
											<p class="mt-2 text-xs text-gray-500">Replacement due {fmtDate(row.replacementDue)}</p>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			{#if totalPages > 1}
				<Pagination currentPage={page} {totalPages} totalItems={filtered.length} itemsPerPage={PAGE_SIZE} onPageChange={(p) => (page = p)} class="mt-4" />
			{/if}
		{/if}
	{/if}
</section>
