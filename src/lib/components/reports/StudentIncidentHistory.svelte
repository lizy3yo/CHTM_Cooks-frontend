<script lang="ts">
	/**
	 * Damage & Missing History (Student Risk tab).
	 *
	 * Every student who has damaged or lost equipment, from borrow requests and
	 * walk-ins, all-time by default. Click a student for their full history.
	 * Below it, unpaid replacements by age and the ones past their due date.
	 */
	import { untrack } from 'svelte';
	import { Search, Download, ChevronRight, History, Receipt, AlertCircle } from 'lucide-svelte';
	import {
		studentIncidentsAPI,
		type StudentIncident,
		type StudentIncidentReport,
		type StudentIncidentSummary
	} from '$lib/api/studentIncidents';
	import { downloadStudentIncidentsExcel } from '$lib/utils/studentIncidentsExcel';
	import { toastStore } from '$lib/stores/toast';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import StudentIncidentModal from './StudentIncidentModal.svelte';

	interface Props {
		/** The report's class filter; applies to both scopes. */
		classCodeIds?: string[];
		/** The report's selected range (yyyy-mm-dd), used when "Selected range" is chosen. */
		range: { from: string; to: string } | null;
		rangeLabel: string;
		/** Changes whenever the surrounding report reloads, so this reloads with it. */
		refreshKey?: string | number | null;
		userName: string;
	}

	let { classCodeIds = [], range, rangeLabel, refreshKey = null, userName }: Props = $props();

	const PAGE_SIZE = 10;

	let scope = $state<'all' | 'range'>('all');
	let report = $state<StudentIncidentReport | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let search = $state('');
	let page = $state(1);
	let exporting = $state(false);

	// Detail modal
	let selected = $state<StudentIncidentSummary | null>(null);
	let detail = $state<StudentIncident[]>([]);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let detailExporting = $state(false);

	const query = $derived({
		...(scope === 'range' && range ? { from: range.from, to: range.to } : {}),
		classCodeIds
	});
	const scopeLabel = $derived(scope === 'all' ? 'All time' : rangeLabel);

	let loadSeq = 0;
	async function load(): Promise<void> {
		const seq = ++loadSeq;
		error = null;
		try {
			const data = await studentIncidentsAPI.list(query);
			if (seq !== loadSeq) return;
			report = data;
		} catch (err) {
			if (seq !== loadSeq) return;
			error = err instanceof Error ? err.message : 'Failed to load damage and missing history.';
		} finally {
			if (seq === loadSeq) loading = false;
		}
	}

	// Reload when the scope, filters or surrounding report change.
	$effect(() => {
		void query;
		void refreshKey;
		untrack(() => {
			page = 1;
			void load();
		});
	});

	const filtered = $derived.by(() => {
		const rows = report?.students ?? [];
		const q = search.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((s) => `${s.studentName} ${s.email ?? ''}`.toLowerCase().includes(q));
	});
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	const pageRows = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	$effect(() => {
		void search;
		untrack(() => (page = 1));
	});

	async function openStudent(studentId: string, fallback?: Partial<StudentIncidentSummary>): Promise<void> {
		const known = report?.students.find((s) => s.studentId === studentId);
		selected = (known ?? ({ studentId, studentName: fallback?.studentName ?? 'Student', ...fallback } as StudentIncidentSummary));
		detail = [];
		detailError = null;
		detailLoading = true;
		try {
			const data = await studentIncidentsAPI.detail(studentId, query);
			if (selected?.studentId !== studentId) return;
			selected = data.student;
			detail = data.incidents;
		} catch (err) {
			detailError = err instanceof Error ? err.message : 'Failed to load this student’s history.';
		} finally {
			detailLoading = false;
		}
	}

	function closeStudent(): void {
		selected = null;
	}

	async function exportAll(student?: { summary: StudentIncidentSummary; incidents: StudentIncident[] }): Promise<void> {
		if (!report) return;
		const setBusy = (v: boolean) => (student ? (detailExporting = v) : (exporting = v));
		setBusy(true);
		try {
			await downloadStudentIncidentsExcel({ report, rangeLabel: scopeLabel, userName, student });
		} catch (err) {
			console.error('[Damage & Missing] Export failed:', err);
			toastStore.error('Could not create the Excel file.', 'Export failed');
		} finally {
			setBusy(false);
		}
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function initials(name: string): string {
		const p = name.trim().split(/\s+/);
		return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
	}

	const aging = $derived(report?.replacementAging);
</script>

<!-- ── Damage & Missing History ─────────────────────────────────────────── -->
<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="incident-history-title">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h3 id="incident-history-title" class="flex items-center gap-2 text-lg font-semibold text-gray-900">
				<History size={18} class="text-pink-600" /> Damage &amp; Missing History
			</h3>
			<p class="mt-1 text-sm text-gray-600">Every damaged or missing item per student, from borrow requests and walk-ins.</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="Time period">
				{#each [{ id: 'all', label: 'All time' }, { id: 'range', label: 'Selected range' }] as opt (opt.id)}
					<button
						type="button"
						onclick={() => (scope = opt.id as 'all' | 'range')}
						disabled={opt.id === 'range' && !range}
						aria-pressed={scope === opt.id}
						class="rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 {scope === opt.id
							? 'bg-white text-pink-700 shadow-sm'
							: 'text-gray-600 hover:text-gray-900'}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => exportAll()}
				disabled={exporting || !report || report.students.length === 0}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
			>
				<Download size={13} />
				{exporting ? 'Exporting…' : 'Export Excel'}
			</button>
		</div>
	</div>

	{#if scope === 'range'}
		<p class="mt-2 text-xs text-gray-500">Showing incidents in: <span class="font-medium text-gray-700">{rangeLabel}</span></p>
	{/if}

	{#if loading && !report}
		<div class="mt-4 animate-pulse space-y-3">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">{#each Array(4) as _}<div class="h-16 rounded-xl bg-gray-100"></div>{/each}</div>
			{#each Array(4) as _}<div class="h-12 rounded-lg bg-gray-100"></div>{/each}
		</div>
	{:else if error && !report}
		<div class="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			<AlertCircle size={16} class="shrink-0" />
			<span class="flex-1">{error}</span>
			<button type="button" onclick={load} class="font-semibold underline hover:no-underline">Retry</button>
		</div>
	{:else if report}
		<!-- Totals -->
		<dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each [
				{ label: 'Students involved', value: report.totals.students, cls: 'text-gray-900' },
				{ label: 'Damaged items', value: report.totals.damaged, cls: 'text-amber-700' },
				{ label: 'Missing items', value: report.totals.missing, cls: 'text-red-700' },
				{ label: 'Pending replacements', value: report.totals.pending, cls: report.totals.pending ? 'text-rose-700' : 'text-gray-900' }
			] as m (m.label)}
				<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
					<dt class="text-sm text-gray-600">{m.label}</dt>
					<dd class="mt-1 text-2xl font-bold {m.cls}">{m.value}</dd>
				</div>
			{/each}
		</dl>

		<!-- Search -->
		<div class="relative mt-4">
			<Search size={16} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
			<input
				type="search"
				bind:value={search}
				placeholder="Search students by name or email"
				aria-label="Search students"
				class="h-10 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-9 text-sm placeholder-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-100 focus:outline-none"
			/>
		</div>

		{#if filtered.length === 0}
			<div class="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
				<p class="text-sm font-medium text-gray-700">
					{search ? 'No students match your search.' : 'No damaged or missing items recorded.'}
				</p>
				{#if !search && scope === 'range'}
					<p class="mt-1 text-xs text-gray-500">Try “All time” to see earlier incidents.</p>
				{/if}
			</div>
		{:else}
			<!-- Table (sm and up) -->
			<div class="mt-4 hidden overflow-x-auto rounded-lg border border-gray-200 sm:block">
				<table class="min-w-full divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
						<tr>
							<th scope="col" class="px-4 py-3">Student</th>
							<th scope="col" class="px-3 py-3 text-center">Damaged</th>
							<th scope="col" class="px-3 py-3 text-center">Missing</th>
							<th scope="col" class="px-3 py-3 text-center">Total</th>
							<th scope="col" class="px-3 py-3 text-center">Still owed</th>
							<th scope="col" class="px-3 py-3">Last incident</th>
							<th scope="col" class="px-3 py-3"><span class="sr-only">Open</span></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each pageRows as s (s.studentId)}
							<tr class="cursor-pointer transition-colors hover:bg-pink-50/40" onclick={() => openStudent(s.studentId)}>
								<td class="px-4 py-3">
									<button type="button" class="flex items-center gap-3 text-left focus:outline-none" onclick={(e) => { e.stopPropagation(); openStudent(s.studentId); }}>
										<span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
											{#if s.profilePhotoUrl}<img src={s.profilePhotoUrl} alt="" class="h-full w-full object-cover" />{:else}{initials(s.studentName)}{/if}
										</span>
										<span class="min-w-0">
											<span class="block truncate font-medium text-gray-900 group-hover:text-pink-700">{s.studentName}</span>
											<span class="block truncate text-xs text-gray-500">{s.email ?? '—'}</span>
										</span>
									</button>
								</td>
								<td class="px-3 py-3 text-center font-semibold text-amber-700">{s.damaged}</td>
								<td class="px-3 py-3 text-center font-semibold text-red-700">{s.missing}</td>
								<td class="px-3 py-3 text-center font-semibold text-gray-900">{s.total}</td>
								<td class="px-3 py-3 text-center">
									{#if s.outstandingUnits > 0}
										<span class="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/20 ring-inset">{s.outstandingUnits}</span>
									{:else}
										<span class="text-gray-400">0</span>
									{/if}
								</td>
								<td class="px-3 py-3 text-gray-600">{fmtDate(s.lastIncidentAt)}</td>
								<td class="px-3 py-3 text-right text-gray-300"><ChevronRight size={16} /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Cards (phones) -->
			<ul class="mt-4 space-y-2 sm:hidden">
				{#each pageRows as s (s.studentId)}
					<li>
						<button type="button" onclick={() => openStudent(s.studentId)} class="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left">
							<span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
								{#if s.profilePhotoUrl}<img src={s.profilePhotoUrl} alt="" class="h-full w-full object-cover" />{:else}{initials(s.studentName)}{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-gray-900">{s.studentName}</span>
								<span class="block text-xs text-gray-500">
									<span class="text-amber-700">{s.damaged} damaged</span> ·
									<span class="text-red-700">{s.missing} missing</span>
									{#if s.outstandingUnits > 0} · <span class="text-rose-700">{s.outstandingUnits} owed</span>{/if}
								</span>
							</span>
							<ChevronRight size={16} class="shrink-0 text-gray-300" />
						</button>
					</li>
				{/each}
			</ul>

			{#if totalPages > 1}
				<Pagination currentPage={page} {totalPages} totalItems={filtered.length} itemsPerPage={PAGE_SIZE} onPageChange={(p) => (page = p)} class="mt-4" />
			{/if}
		{/if}
	{/if}
</section>

<!-- ── Unpaid Replacements ──────────────────────────────────────────────── -->
{#if aging}
	<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="unpaid-replacements-title">
		<h3 id="unpaid-replacements-title" class="flex items-center gap-2 text-lg font-semibold text-gray-900">
			<Receipt size={18} class="text-pink-600" /> Unpaid Replacements
		</h3>
		<p class="mt-1 text-sm text-gray-600">Replacements students still owe, by how long they have been open. Always current, not limited to the selected range.</p>

		<dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
			{#each [
				{ label: 'Open', value: aging.open, cls: 'text-gray-900' },
				{ label: 'Up to 7 days', value: aging.within7Days, cls: 'text-gray-900' },
				{ label: '8–30 days', value: aging.within30Days, cls: aging.within30Days ? 'text-amber-700' : 'text-gray-900' },
				{ label: 'Over 30 days', value: aging.over30Days, cls: aging.over30Days ? 'text-orange-700' : 'text-gray-900' },
				{ label: 'Past due date', value: aging.pastDue, cls: aging.pastDue ? 'text-red-700' : 'text-gray-900' }
			] as m (m.label)}
				<div class="rounded-xl border p-4 {m.label === 'Past due date' && aging.pastDue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}">
					<dt class="text-sm text-gray-600">{m.label}</dt>
					<dd class="mt-1 text-2xl font-bold {m.cls}">{m.value}</dd>
				</div>
			{/each}
		</dl>

		{#if aging.pastDueItems.length > 0}
			<div class="mt-4 overflow-x-auto rounded-lg border border-gray-200">
				<table class="min-w-full divide-y divide-gray-200 text-sm">
					<caption class="sr-only">Replacements past their due date, most overdue first</caption>
					<thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
						<tr>
							<th scope="col" class="px-4 py-3">Student</th>
							<th scope="col" class="px-3 py-3">Item</th>
							<th scope="col" class="px-3 py-3 text-center">Still owed</th>
							<th scope="col" class="px-3 py-3">Due</th>
							<th scope="col" class="px-3 py-3 text-right">Past due</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each aging.pastDueItems as p (p.id)}
							<tr>
								<td class="px-4 py-3">
									<button type="button" onclick={() => openStudent(p.studentId, { studentName: p.studentName })} class="font-medium text-gray-900 hover:text-pink-700 hover:underline">
										{p.studentName}
									</button>
								</td>
								<td class="px-3 py-3 text-gray-700">
									{p.itemName}
									<span class="ml-1 text-xs {p.type === 'missing' ? 'text-red-600' : 'text-amber-600'}">({p.type})</span>
								</td>
								<td class="px-3 py-3 text-center font-semibold text-rose-700">{p.outstanding}</td>
								<td class="px-3 py-3 text-gray-600">{fmtDate(p.dueDate)}</td>
								<td class="px-3 py-3 text-right font-semibold text-red-700">{p.daysPastDue} day{p.daysPastDue === 1 ? '' : 's'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if aging.pastDue > aging.pastDueItems.length}
				<p class="mt-2 text-xs text-gray-500">Showing the {aging.pastDueItems.length} most overdue of {aging.pastDue}. The Excel export includes the same list.</p>
			{/if}
		{:else if aging.open > 0}
			<p class="mt-4 text-sm text-gray-500">Nothing is past its due date.</p>
		{/if}
	</section>
{/if}

<StudentIncidentModal
	open={selected !== null}
	summary={selected}
	incidents={detail}
	loading={detailLoading}
	error={detailError}
	{scopeLabel}
	exporting={detailExporting}
	onExport={() => selected && exportAll({ summary: selected, incidents: detail })}
	onClose={closeStudent}
/>
