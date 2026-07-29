<script lang="ts" module>
	export type ExportOption = { id: string; label: string };
	export type ExportSection = { id: string; label: string; description: string };
	export interface AnalyticsExportConfig {
		timeframeMode: 'current' | 'custom';
		customFrom: string;
		customTo: string;
		classIds: string[];
		studentIds: string[];
		instructorIds: string[];
		custodianIds: string[];
		/** Walk-in borrower names (students or guests) — scopes the walk-in worksheet. */
		walkInPersons: string[];
		sections: string[];
	}
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import SearchableSelect from './SearchableSelect.svelte';
	import {
		X,
		Download,
		Calendar,
		Filter,
		ListChecks,
		ClipboardCheck,
		Check,
		ChevronLeft,
		ChevronRight
	} from 'lucide-svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		exporting?: boolean;
		/** Label describing the page's current date range (used for "Current View"). */
		currentRangeLabel: string;
		classes?: ExportOption[];
		students?: ExportOption[];
		instructors?: ExportOption[];
		custodians?: ExportOption[];
		/** Walk-in borrowers (students or guests) seen in the current data. */
		walkInPeople?: ExportOption[];
		defaultClassId?: string;
		defaultStudentId?: string;
		defaultInstructorId?: string;
		defaultCustodianId?: string;
		defaultWalkInPerson?: string;
		sections: ExportSection[];
		onGenerate: (config: AnalyticsExportConfig) => void;
	}

	let {
		open,
		onClose,
		exporting = false,
		currentRangeLabel,
		classes = [],
		students = [],
		instructors = [],
		custodians = [],
		walkInPeople = [],
		defaultClassId = '',
		defaultStudentId = '',
		defaultInstructorId = '',
		defaultCustodianId = '',
		defaultWalkInPerson = '',
		sections,
		onGenerate
	}: Props = $props();

	const steps = [
		{ id: 'timeframe', label: 'Timeframe', icon: Calendar },
		{ id: 'scope', label: 'Scope', icon: Filter },
		{ id: 'sections', label: 'Sections', icon: ListChecks },
		{ id: 'review', label: 'Review', icon: ClipboardCheck }
	];

	let step = $state(0);
	let dir = $state(1); // slide direction: 1 forward, -1 back
	let timeframeMode = $state<'current' | 'custom'>('current');
	let customFrom = $state('');
	let customTo = $state('');
	let classIds = $state<string[]>([]);
	let studentIds = $state<string[]>([]);
	let instructorIds = $state<string[]>([]);
	let custodianIds = $state<string[]>([]);
	let walkInPersons = $state<string[]>([]);
	let selected = $state<Record<string, boolean>>({});

	// Reset the wizard whenever it (re)opens.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			step = 0;
			dir = 1;
			timeframeMode = 'current';
			customFrom = '';
			customTo = '';
			classIds = defaultClassId ? [defaultClassId] : [];
			studentIds = defaultStudentId ? [defaultStudentId] : [];
			instructorIds = defaultInstructorId ? [defaultInstructorId] : [];
			custodianIds = defaultCustodianId ? [defaultCustodianId] : [];
			walkInPersons = defaultWalkInPerson ? [defaultWalkInPerson] : [];
			classEnabled = true;
			studentEnabled = true;
			instructorEnabled = true;
			custodianEnabled = true;
			walkInEnabled = true;
			selected = Object.fromEntries(sections.map((s) => [s.id, true]));
		}
		wasOpen = open;
	});

	const isLast = $derived(step === steps.length - 1);
	const selectedCount = $derived(sections.filter((s) => selected[s.id]).length);
	const canGenerate = $derived(selectedCount > 0);
	const customValid = $derived(!(timeframeMode === 'custom') || !!(customFrom && customTo));

	// Each scope filter can be switched off individually; a disabled filter is
	// simply not applied (its picked values are ignored for the export).
	let classEnabled = $state(true);
	let studentEnabled = $state(true);
	let instructorEnabled = $state(true);
	let custodianEnabled = $state(true);
	let walkInEnabled = $state(true);

	const effClassIds = $derived(classEnabled ? classIds : []);
	const effStudentIds = $derived(studentEnabled ? studentIds : []);
	const effInstructorIds = $derived(instructorEnabled ? instructorIds : []);
	const effCustodianIds = $derived(custodianEnabled ? custodianIds : []);
	const effWalkInPersons = $derived(walkInEnabled ? walkInPersons : []);

	function labelFor(list: ExportOption[], ids: string[], allLabel: string): string {
		if (!ids.length) return allLabel;
		if (ids.length === 1) return list.find((o) => o.id === ids[0])?.label ?? 'Selected';
		return `${ids.length} selected`;
	}
	const classLabel = $derived(labelFor(classes, effClassIds, 'All Classes'));
	const studentLabel = $derived(labelFor(students, effStudentIds, 'All Students'));
	const instructorLabel = $derived(labelFor(instructors, effInstructorIds, 'All Instructors'));
	const custodianLabel = $derived(labelFor(custodians, effCustodianIds, 'All Custodians'));
	const walkInPersonLabel = $derived(labelFor(walkInPeople, effWalkInPersons, 'All Walk-in Borrowers'));
	const timeframeLabel = $derived(
		timeframeMode === 'current'
			? currentRangeLabel
			: customFrom && customTo
				? `${customFrom} → ${customTo}`
				: 'Custom range (dates not set)'
	);

	function next() {
		if (isLast || !customValid) return;
		dir = 1;
		step += 1;
	}
	function back() {
		if (step === 0) return;
		dir = -1;
		step -= 1;
	}
	function toggleAll(v: boolean) {
		selected = Object.fromEntries(sections.map((s) => [s.id, v]));
	}
	function generate() {
		if (!canGenerate || !customValid || exporting) return;
		onGenerate({
			timeframeMode,
			customFrom,
			customTo,
			classIds: effClassIds,
			studentIds: effStudentIds,
			instructorIds: effInstructorIds,
			custodianIds: effCustodianIds,
			walkInPersons: effWalkInPersons,
			sections: sections.filter((s) => selected[s.id]).map((s) => s.id)
		});
	}

	// Cycling status lines while the export runs — makes the process feel alive.
	const genMessages = [
		'Preparing your data…',
		'Building the selected sections…',
		'Formatting the spreadsheet…',
		'Finalizing your report…'
	];
	let genMsgIdx = $state(0);
	$effect(() => {
		if (!exporting) {
			genMsgIdx = 0;
			return;
		}
		const t = setInterval(() => {
			genMsgIdx = (genMsgIdx + 1) % genMessages.length;
		}, 950);
		return () => clearInterval(t);
	});

</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape' && !exporting) onClose(); }} />

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button
			type="button"
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			aria-label="Close"
			onclick={() => !exporting && onClose()}
		></button>

		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="relative w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
				in:fly={{ y: 16, duration: 220, easing: cubicOut }}
			>
				<!-- Header -->
				<div class="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-7 sm:py-5">
					<div>
						<h2 class="text-lg font-bold text-gray-900">Export Analytics Report</h2>
						<p class="mt-0.5 text-xs text-gray-500">Configure your spreadsheet export in a few steps.</p>
					</div>
					<button
						type="button"
						onclick={() => !exporting && onClose()}
						disabled={exporting}
						class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
						aria-label="Close"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<!-- Progress stepper -->
				<div class="px-5 pt-5 sm:px-7">
					<div class="flex items-center">
						{#each steps as s, i}
							<div class="flex items-center {i < steps.length - 1 ? 'flex-1' : ''}">
								<div class="flex flex-col items-center gap-1">
									<div
										class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 {i <
										step
											? 'bg-pink-600 text-white'
											: i === step
												? 'bg-pink-600 text-white ring-4 ring-pink-100'
												: 'bg-gray-100 text-gray-400'}"
									>
										{#if i < step}
											<Check class="h-4 w-4" />
										{:else}
											<s.icon class="h-4 w-4" />
										{/if}
									</div>
									<span
										class="text-[10px] font-semibold uppercase tracking-wide transition-colors {i <=
										step
											? 'text-pink-600'
											: 'text-gray-400'}">{s.label}</span
									>
								</div>
								{#if i < steps.length - 1}
									<div class="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-gray-100">
										<div
											class="h-full bg-pink-600 transition-all duration-300"
											style="width: {i < step ? '100%' : '0%'}"
										></div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Body -->
				<div class="relative min-h-[248px] overflow-hidden px-5 py-5 sm:px-7">
					{#if exporting}
						<!-- Generating state -->
						<div class="flex min-h-[248px] flex-col items-center justify-center gap-5 text-center" in:fly={{ y: 8, duration: 200 }}>
							<div class="relative h-14 w-14">
								<div class="absolute inset-0 rounded-full border-4 border-pink-100"></div>
								<div class="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-pink-600"></div>
								<Download class="absolute inset-0 m-auto h-5 w-5 text-pink-600" />
							</div>
							<div>
								<p class="text-sm font-semibold text-gray-900">Generating your report</p>
								{#key genMsgIdx}
									<p class="mt-1 text-xs text-gray-500" in:fly={{ y: 6, duration: 250 }}>
										{genMessages[genMsgIdx]}
									</p>
								{/key}
							</div>
							<div class="h-1.5 w-56 overflow-hidden rounded-full bg-gray-100">
								<div class="export-progress h-full rounded-full bg-pink-600"></div>
							</div>
						</div>
					{:else}
						{#key step}
							<div in:fly={{ x: dir * 24, duration: 220, easing: cubicOut }} class="space-y-4">
								{#if step === 0}
									<!-- Timeframe -->
									<p class="text-sm font-semibold text-gray-700">Which period should the report cover?</p>
									<div class="grid grid-cols-2 gap-3">
										<button
											type="button"
											onclick={() => (timeframeMode = 'current')}
											class="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition {timeframeMode ===
											'current'
												? 'border-pink-600 bg-pink-50/40 ring-1 ring-pink-600'
												: 'border-gray-200 bg-white hover:bg-gray-50'}"
										>
											<span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Current View</span>
											<span class="text-sm font-medium text-gray-800">{currentRangeLabel}</span>
										</button>
										<button
											type="button"
											onclick={() => (timeframeMode = 'custom')}
											class="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition {timeframeMode ===
											'custom'
												? 'border-pink-600 bg-pink-50/40 ring-1 ring-pink-600'
												: 'border-gray-200 bg-white hover:bg-gray-50'}"
										>
											<span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Custom Range</span>
											<span class="text-sm font-medium text-gray-800">Pick specific dates</span>
										</button>
									</div>
									{#if timeframeMode === 'custom'}
										<div class="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3" in:fly={{ y: 6, duration: 180 }}>
											<div>
												<label for="exp-from" class="block text-xs font-medium text-gray-600">Start date</label>
												<input id="exp-from" type="date" bind:value={customFrom} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none" />
											</div>
											<div>
												<label for="exp-to" class="block text-xs font-medium text-gray-600">End date</label>
												<input id="exp-to" type="date" bind:value={customTo} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none" />
											</div>
										</div>
										{#if !customValid}
											<p class="text-xs text-rose-600">Please choose both a start and end date.</p>
										{/if}
									{/if}
								{:else if step === 1}
									<!-- Scope -->
									<p class="text-sm font-semibold text-gray-700">Whose data should be included?</p>
									<p class="text-xs text-gray-500">Switch any filter off to ignore it. Enabled filters narrow the export; a disabled one counts as “All”.</p>
									<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
										{#each [
											{ key: 'class', label: 'Class', opts: classes, all: 'All Classes', ph: 'Search classes…' },
											{ key: 'student', label: 'Student', opts: students, all: 'All Students', ph: 'Search students…' },
											{ key: 'instructor', label: 'Instructor', opts: instructors, all: 'All Instructors', ph: 'Search instructors…' },
											{ key: 'custodian', label: 'Custodian', opts: custodians, all: 'All Custodians', ph: 'Search custodians…' },
											{ key: 'walkin', label: 'Walk-in Borrower', opts: walkInPeople, all: 'All Walk-in Borrowers', ph: 'Search walk-in people…' }
										] as f (f.key)}
											{@const on =
												f.key === 'class' ? classEnabled
												: f.key === 'student' ? studentEnabled
												: f.key === 'instructor' ? instructorEnabled
												: f.key === 'custodian' ? custodianEnabled
												: walkInEnabled}
											<div class="{f.key === 'walkin' ? 'sm:col-span-2' : ''}">
												<div class="flex items-center justify-between">
													<span class="text-xs font-semibold uppercase tracking-wider {on ? 'text-gray-500' : 'text-gray-400'}">{f.label}</span>
													<button
														type="button"
														role="switch"
														aria-checked={on}
														aria-label="{on ? 'Disable' : 'Enable'} {f.label} filter"
														onclick={() => {
															if (f.key === 'class') classEnabled = !classEnabled;
															else if (f.key === 'student') studentEnabled = !studentEnabled;
															else if (f.key === 'instructor') instructorEnabled = !instructorEnabled;
															else if (f.key === 'custodian') custodianEnabled = !custodianEnabled;
															else walkInEnabled = !walkInEnabled;
														}}
														class="relative h-4 w-7 shrink-0 rounded-full transition-colors {on ? 'bg-pink-600' : 'bg-gray-300'}"
													>
														<span class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all {on ? 'left-3.5' : 'left-0.5'}"></span>
													</button>
												</div>
												<div class="mt-1 {on ? '' : 'pointer-events-none select-none opacity-40'}">
													{#if f.key === 'class'}
														<SearchableSelect multiple bind:value={classIds} options={f.opts} allLabel={f.all} placeholder={f.ph} />
													{:else if f.key === 'student'}
														<SearchableSelect multiple bind:value={studentIds} options={f.opts} allLabel={f.all} placeholder={f.ph} />
													{:else if f.key === 'instructor'}
														<SearchableSelect multiple bind:value={instructorIds} options={f.opts} allLabel={f.all} placeholder={f.ph} />
													{:else if f.key === 'custodian'}
														<SearchableSelect multiple bind:value={custodianIds} options={f.opts} allLabel={f.all} placeholder={f.ph} />
													{:else}
														<SearchableSelect multiple bind:value={walkInPersons} options={f.opts} allLabel={f.all} placeholder={f.ph} />
													{/if}
												</div>
											</div>
										{/each}
									</div>
								{:else if step === 2}
									<!-- Sections -->
									<div class="flex items-center justify-between">
										<p class="text-sm font-semibold text-gray-700">What should the file include?</p>
										<div class="flex gap-2 text-xs font-semibold">
											<button type="button" onclick={() => toggleAll(true)} class="text-pink-600 hover:text-pink-700">Select all</button>
											<span class="text-gray-300">|</span>
											<button type="button" onclick={() => toggleAll(false)} class="text-pink-600 hover:text-pink-700">Clear all</button>
										</div>
									</div>
									<div class="max-h-[190px] space-y-2 overflow-y-auto pr-1">
										{#each sections as sec}
											<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 transition hover:border-pink-200 hover:bg-pink-50/30">
												<input type="checkbox" bind:checked={selected[sec.id]} class="mt-0.5 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
												<span class="flex flex-col">
													<span class="text-sm font-semibold text-gray-800">{sec.label}</span>
													<span class="text-xs text-gray-500">{sec.description}</span>
												</span>
											</label>
										{/each}
									</div>
									{#if !canGenerate}
										<p class="text-xs text-rose-600">Select at least one section to export.</p>
									{/if}
								{:else}
									<!-- Review -->
									<p class="text-sm font-semibold text-gray-700">Review &amp; generate</p>
									<div class="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
										<div class="flex justify-between gap-3"><span class="text-gray-500">Timeframe</span><span class="text-right font-medium text-gray-800">{timeframeLabel}</span></div>
										<div class="flex justify-between gap-3"><span class="text-gray-500">Class</span><span class="text-right font-medium text-gray-800">{classLabel}</span></div>
										<div class="flex justify-between gap-3"><span class="text-gray-500">Student</span><span class="text-right font-medium text-gray-800">{studentLabel}</span></div>
										<div class="flex justify-between gap-3"><span class="text-gray-500">Instructor</span><span class="text-right font-medium text-gray-800">{instructorLabel}</span></div>
										<div class="flex justify-between gap-3"><span class="text-gray-500">Custodian</span><span class="text-right font-medium text-gray-800">{custodianLabel}</span></div>
										<div class="flex justify-between gap-3"><span class="text-gray-500">Walk-in Borrower</span><span class="text-right font-medium text-gray-800">{walkInPersonLabel}</span></div>
										<div class="flex justify-between gap-3 border-t border-gray-200 pt-2"><span class="text-gray-500">Sections</span><span class="text-right font-medium text-gray-800">{selectedCount} of {sections.length}</span></div>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each sections.filter((s) => selected[s.id]) as sec}
											<span class="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-0.5 text-xs font-medium text-pink-700 ring-1 ring-pink-600/10">
												<Check class="h-3 w-3" />{sec.label}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						{/key}
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 sm:px-7">
					<button
						type="button"
						onclick={step === 0 ? onClose : back}
						disabled={exporting}
						class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
					>
						{#if step === 0}
							Cancel
						{:else}
							<ChevronLeft class="h-4 w-4" />Back
						{/if}
					</button>

					{#if isLast}
						<button
							type="button"
							onclick={generate}
							disabled={!canGenerate || !customValid || exporting}
							class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Download class="h-4 w-4" />
							{exporting ? 'Generating…' : 'Generate Excel'}
						</button>
					{:else}
						<button
							type="button"
							onclick={next}
							disabled={!customValid}
							class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Next<ChevronRight class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes exportProgress {
		0% { transform: translateX(-100%); width: 40%; }
		50% { width: 60%; }
		100% { transform: translateX(250%); width: 40%; }
	}
	.export-progress {
		animation: exportProgress 1.3s ease-in-out infinite;
	}
</style>
