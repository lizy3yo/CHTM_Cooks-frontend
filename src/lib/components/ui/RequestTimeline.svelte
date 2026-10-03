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
		HandHelping,
		Undo2,
		ClipboardCheck,
		TriangleAlert,
		ShieldCheck,
		Ban,
		CalendarX
	} from 'lucide-svelte';

	interface Props {
		/** Renders nothing until a record is available. */
		record: BorrowRequestRecord | null | undefined;
		viewer?: 'student' | 'staff';
	}

	let { record, viewer = 'staff' }: Props = $props();

	const steps = $derived(record ? buildRequestTimeline(record, { viewer }) : []);

	const ICONS: Record<TimelineStepKind, typeof FileText> = {
		submitted: FileText,
		review: Hourglass,
		declined: CircleX,
		appealed: RotateCcw,
		approved: CheckCheck,
		ready: PackageCheck,
		pickup: HandHelping,
		return: Undo2,
		checkin: ClipboardCheck,
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
</div>
{/if}
