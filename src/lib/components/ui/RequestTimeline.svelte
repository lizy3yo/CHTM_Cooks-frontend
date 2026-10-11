<script lang="ts">
	/**
	 * Full lifecycle of a borrow request, from submission to return.
	 * Shared by every role's request detail view; the steps come from
	 * `buildRequestTimeline`, so all roles see the same history.
	 *
	 * Horizontal stepper from `sm` up, vertical list on phones.
	 */
	import type { BorrowRequestRecord } from '$lib/api/borrowRequests';
	import {
		buildRequestTimeline,
		borrowDayCount,
		inspectionUnits,
		returnTotals,
		type TimelineStep,
		type TimelineStepKind,
		type TimelineStepState
	} from '$lib/utils/requestTimeline';
	import {
		FileText,
		Hourglass,
		CircleX,
		RotateCcw,
		CheckCheck,
		PackageCheck,
		PackageOpen,
		CircleCheckBig,
		HandHelping,
		Undo2,
		ClipboardCheck,
		TriangleAlert,
		ShieldCheck,
		Ban,
		CalendarX,
		ChevronDown
	} from 'lucide-svelte';

	interface Props {
		/** Renders nothing until a record is available. */
		record: BorrowRequestRecord | null | undefined;
		viewer?: 'student' | 'staff';
	}

	let { record, viewer = 'staff' }: Props = $props();

	const steps = $derived(record ? buildRequestTimeline(record, { viewer }) : []);

	const days = $derived(record ? borrowDayCount(record) : null);
	const totals = $derived(record ? returnTotals(record) : null);
	const inspectedItems = $derived(record ? record.items.filter((i) => i.inspection) : []);

	/** The return report opens from the condition badge on the final step. */
	let reportOpen = $state(false);

	function plural(n: number, word: string): string {
		return `${n} ${word}${n === 1 ? '' : 's'}`;
	}

	function shortDay(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function dateTime(iso: string | Date | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	const ICONS: Record<TimelineStepKind, typeof FileText> = {
		submitted: FileText,
		review: Hourglass,
		declined: CircleX,
		appealed: RotateCcw,
		approved: CheckCheck,
		preparing: PackageOpen,
		ready: PackageCheck,
		pickup: HandHelping,
		return: Undo2,
		checkin: ClipboardCheck,
		returned: CircleCheckBig,
		issues: TriangleAlert,
		resolved: ShieldCheck,
		cancelled: Ban,
		expired: CalendarX
	};

	const CIRCLE: Record<TimelineStepState, string> = {
		complete: 'border-pink-600 bg-white text-pink-600',
		current: 'border-pink-600 bg-pink-50 text-pink-600 ring-4 ring-pink-100',
		upcoming: 'border-dashed border-gray-300 bg-white text-gray-400',
		warning: 'border-amber-500 bg-amber-50 text-amber-600',
		failed: 'border-red-600 bg-red-50 text-red-600',
		cancelled: 'border-slate-400 bg-slate-50 text-slate-500'
	};

	const LABEL: Record<TimelineStepState, string> = {
		complete: 'text-gray-900',
		current: 'text-pink-700',
		upcoming: 'text-gray-400',
		warning: 'text-amber-700',
		failed: 'text-red-700',
		cancelled: 'text-slate-600'
	};

	const STATE_TEXT: Record<TimelineStepState, string> = {
		complete: 'Completed',
		current: 'In progress',
		upcoming: 'Upcoming',
		warning: 'Needs attention',
		failed: 'Ended',
		cancelled: 'Cancelled'
	};

	/** A connector is "travelled" once the step it leaves has happened. */
	function travelled(step: TimelineStep): boolean {
		return step.at !== null && (step.state === 'complete' || step.state === 'warning');
	}

	function formatWhen(step: TimelineStep): string | null {
		if (!step.at) return null;
		const d = new Date(step.at);
		if (Number.isNaN(d.getTime())) return null;
		// The year only adds noise for this year's requests.
		const sameYear = d.getFullYear() === new Date().getFullYear();
		const date = d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			...(sameYear ? {} : { year: 'numeric' })
		});
		const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return `${date} · ${time}`;
	}

	const legend = $derived.by(() => {
		const present = new Set(steps.map((s) => s.state));
		const items: Array<{ state: TimelineStepState; dot: string; text: string }> = [
			{ state: 'complete', dot: 'bg-pink-600', text: 'Completed' },
			{ state: 'current', dot: 'bg-pink-300 ring-2 ring-pink-100', text: 'In progress' },
			{ state: 'upcoming', dot: 'bg-gray-300', text: 'Upcoming' },
			{ state: 'warning', dot: 'bg-amber-500', text: 'Needs attention' },
			{ state: 'failed', dot: 'bg-red-600', text: 'Declined / Expired' },
			{ state: 'cancelled', dot: 'bg-slate-400', text: 'Cancelled' }
		];
		// Only explain states that actually appear on this timeline.
		return items.filter((i) => present.has(i.state));
	});
</script>

{#if steps.length}
<div class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5">
	{#if days}
		<!-- How long the items have been out, against the due date -->
		<dl class="mb-4 grid grid-cols-3 gap-2 border-b border-gray-200 pb-4 text-center sm:gap-3">
			<div class="rounded-xl bg-gray-50 px-2 py-2">
				<dt class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">{days.out ? 'Borrowed for' : 'Kept for'}</dt>
				<dd class="mt-0.5 text-sm font-bold text-gray-900 sm:text-base">{plural(days.daysBorrowed, 'day')}</dd>
			</div>
			<div class="rounded-xl bg-gray-50 px-2 py-2">
				<dt class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">Due</dt>
				<dd class="mt-0.5 text-sm font-bold text-gray-900 sm:text-base">{shortDay(days.dueAt)}</dd>
			</div>
			{#if days.out && days.daysLate > 0}
				<div class="rounded-xl bg-red-50 px-2 py-2">
					<dt class="text-[10px] font-semibold tracking-wide text-red-600 uppercase">Overdue by</dt>
					<dd class="mt-0.5 text-sm font-bold text-red-700 sm:text-base">{plural(days.daysLate, 'day')}</dd>
				</div>
			{:else if days.out}
				<div class="rounded-xl bg-pink-50 px-2 py-2">
					<dt class="text-[10px] font-semibold tracking-wide text-pink-600 uppercase">Time left</dt>
					<dd class="mt-0.5 text-sm font-bold text-pink-700 sm:text-base">
						{days.dueToday ? 'Due today' : plural(days.daysLeft ?? 0, 'day')}
					</dd>
				</div>
			{:else if days.daysLate > 0}
				<div class="rounded-xl bg-amber-50 px-2 py-2">
					<dt class="text-[10px] font-semibold tracking-wide text-amber-700 uppercase">Returned late by</dt>
					<dd class="mt-0.5 text-sm font-bold text-amber-700 sm:text-base">{plural(days.daysLate, 'day')}</dd>
				</div>
			{:else}
				<div class="rounded-xl bg-emerald-50 px-2 py-2">
					<dt class="text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">Returned</dt>
					<dd class="mt-0.5 text-sm font-bold text-emerald-700 sm:text-base">On time</dd>
				</div>
			{/if}
		</dl>
		{#if record?.overdueNoticeSentAt && days.out}
			<p class="-mt-2 mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
				Disciplinary notice sent {shortDay(record.overdueNoticeSentAt)}. Borrowing is on hold until the items are returned.
			</p>
		{/if}
	{/if}

	<ol class="relative flex flex-col gap-0 sm:flex-row sm:items-start sm:justify-between" aria-label="Request progress">
		{#each steps as step, idx (step.kind + idx)}
			{@const Icon = ICONS[step.kind]}
			{@const isLast = idx === steps.length - 1}
			{@const when = formatWhen(step)}
			<li
				class="relative flex gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:pb-0 sm:text-center"
				aria-current={step.state === 'current' ? 'step' : undefined}
			>
				{#if !isLast}
					<!-- Connector to the next step: vertical on phones, horizontal from sm up -->
					<span
						aria-hidden="true"
						class="absolute top-10 left-5 h-[calc(100%-2.5rem)] w-0.5 sm:top-6 sm:left-1/2 sm:h-0.5 sm:w-full {travelled(step)
							? 'bg-pink-500'
							: 'bg-gray-200'}"
					></span>
				{/if}

				<div
					class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 sm:h-12 sm:w-12 {CIRCLE[step.state]}"
				>
					<Icon size={18} class={step.state === 'current' ? 'animate-pulse' : ''} aria-hidden="true" />
				</div>

				<div class="min-w-0 flex-1 pt-1 sm:mt-2 sm:w-full sm:px-1 sm:pt-0">
					<p class="text-sm font-semibold leading-tight sm:text-xs {LABEL[step.state]}">
						{step.label}
						<span class="sr-only">— {STATE_TEXT[step.state]}</span>
					</p>
					{#if step.actor}
						<p class="mt-0.5 truncate text-xs text-gray-500 sm:text-[11px]" title={step.actor}>{step.actor}</p>
					{/if}
					{#if when}
						<p class="mt-0.5 text-xs font-medium text-pink-600 sm:text-[11px]">
							<time datetime={step.at} title={new Date(step.at!).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}>{when}</time>
						</p>
					{:else if step.state === 'upcoming'}
						<p class="mt-0.5 text-xs text-gray-400 sm:text-[11px]">Upcoming</p>
					{/if}
					{#if step.note}
						<p
							class="mt-0.5 line-clamp-2 text-xs sm:text-[11px] {step.state === 'failed'
								? 'text-red-600'
								: step.state === 'warning'
									? 'text-amber-700'
									: step.state === 'current'
										? 'text-pink-700'
										: 'text-gray-500'}"
							title={step.note}
						>
							{step.note}
						</p>
					{/if}
					{#if (step.kind === 'returned' || step.kind === 'issues') && totals?.inspected}
							<!-- Condition of what came back; opens the return report -->
							<button
								type="button"
								onclick={() => (reportOpen = !reportOpen)}
								aria-expanded={reportOpen}
								aria-controls="return-report"
								title="View the return report"
								class="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-lg p-0.5 text-[11px] font-semibold transition-colors hover:bg-gray-100 focus:ring-2 focus:ring-pink-300 focus:outline-none sm:justify-center"
							>
								{#if totals.damaged > 0}
									<span class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{totals.damaged} damaged</span>
								{/if}
								{#if totals.missing > 0}
									<span class="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{totals.missing} missing</span>
								{/if}
								{#if totals.damaged === 0 && totals.missing === 0}
									<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{totals.good} good</span>
								{/if}
								<ChevronDown size={14} class="text-gray-500 transition-transform {reportOpen ? 'rotate-180' : ''}" aria-hidden="true" />
							</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>

	<div class="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-gray-200 pt-3 text-[11px] sm:text-xs">
		{#each legend as item (item.state)}
			<span class="inline-flex items-center gap-1.5 text-gray-600">
				<span class="h-2 w-2 rounded-full {item.dot}"></span>
				{item.text}
			</span>
		{/each}
	</div>

	{#if reportOpen && totals?.inspected}
		<section id="return-report" class="mt-4 border-t border-gray-200 pt-4 text-left" aria-label="Return report">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h4 class="text-sm font-bold text-gray-900">Return Report</h4>
				<div class="flex flex-wrap gap-1.5 text-[11px] font-semibold">
					<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Good {totals.good}</span>
					<span class="rounded-full px-2 py-0.5 {totals.damaged ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}">Damaged {totals.damaged}</span>
					<span class="rounded-full px-2 py-0.5 {totals.missing ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'}">Missing {totals.missing}</span>
					{#if totals.over > 0}
						<span class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Extra +{totals.over}</span>
					{/if}
				</div>
			</div>

			<ul class="mt-3 space-y-2">
				{#each inspectedItems as item (item.itemId)}
					{@const units = inspectionUnits(item)}
					{@const inspection = item.inspection!}
					<li class="rounded-xl border border-gray-200 bg-white p-3">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<p class="text-sm font-semibold text-gray-900">
								{item.name}
								<span class="font-normal text-gray-500">· {item.quantity} borrowed</span>
							</p>
							<div class="flex flex-wrap gap-1 text-[11px] font-semibold">
								<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Good {units.good}</span>
								{#if units.damaged > 0}
									<span class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Damaged {units.damaged}</span>
								{/if}
								{#if units.missing > 0}
									<span class="rounded-full bg-red-100 px-2 py-0.5 text-red-800">Missing {units.missing}</span>
								{/if}
								{#if units.over > 0}
									<span class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Extra +{units.over}</span>
								{/if}
							</div>
						</div>

						{#if inspection.remarks}
							<p class="mt-2 text-xs text-gray-700"><span class="font-semibold text-gray-500">Custodian note:</span> {inspection.remarks}</p>
						{/if}

						{#if inspection.photos?.length}
							<div class="mt-2 flex flex-wrap gap-2">
								{#each inspection.photos as photo, i (photo)}
									<a href={photo} target="_blank" rel="noopener noreferrer" class="block h-16 w-16 overflow-hidden rounded-lg border border-gray-200 hover:border-pink-400" title="Open photo {i + 1}">
										<img src={photo} alt="Damage to {item.name}, photo {i + 1}" class="h-full w-full object-cover" loading="lazy" />
									</a>
								{/each}
							</div>
						{/if}

						<p class="mt-2 text-[11px] text-gray-500">
							Inspected{inspection.inspectedByName ? ` by ${inspection.inspectedByName}` : ''} · {dateTime(inspection.inspectedAt)}
							{#if (units.damaged > 0 || units.missing > 0) && inspection.dueDate}
								· Replacement due {shortDay(inspection.dueDate)}
							{/if}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
{/if}
