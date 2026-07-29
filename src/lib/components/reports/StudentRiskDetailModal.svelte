<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { X, User, Calendar, Hash, Layers, ShieldCheck } from 'lucide-svelte';
	import type { BorrowEntry } from './BorrowingDetailModal.svelte';

	interface Props {
		open: boolean;
		student: {
			studentName?: string;
			studentEmail?: string;
			trustScore?: number;
			trustTier?: string;
			trustTierLabel?: string;
			totalPenalties?: number;
			totalBonuses?: number;
			requestsTotal?: number;
			requestsReturned?: number;
			activeObligations?: number;
		} | null;
		entries: BorrowEntry[];
		onClose: () => void;
	}
	let { open, student, entries, onClose }: Props = $props();

	const score = $derived(Math.round(student?.trustScore ?? 0));
	const items = $derived.by(() => {
		if (!open || !student) return [];
		return entries.filter(
			(e) =>
				(student.studentEmail && e.studentEmail === student.studentEmail) ||
				e.studentName === student.studentName
		);
	});

	function tierClasses(tier?: string): string {
		switch (tier) {
			case 'excellent': return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10';
			case 'good': return 'bg-teal-50 text-teal-700 ring-teal-600/10';
			case 'fair': return 'bg-amber-50 text-amber-700 ring-amber-600/10';
			case 'poor': return 'bg-orange-50 text-orange-700 ring-orange-600/10';
			case 'critical': return 'bg-rose-50 text-rose-700 ring-rose-600/10';
			default: return 'bg-gray-100 text-gray-600 ring-gray-500/10';
		}
	}
	function barClass(s: number): string {
		if (s >= 85) return 'bg-emerald-500';
		if (s >= 70) return 'bg-teal-500';
		if (s >= 50) return 'bg-amber-500';
		if (s >= 30) return 'bg-orange-500';
		return 'bg-rose-500';
	}
	function fmtDate(d: string): string {
		const dt = new Date(d);
		return isNaN(dt.getTime()) ? (d ?? '').slice(0, 10) : dt.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
	}
	function shortReq(id: string): string { return id ? `#${id.slice(-6).toUpperCase()}` : '—'; }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onClose(); }} />

{#if open && student}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onclick={onClose}></button>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div class="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" in:fly={{ y: 16, duration: 220, easing: cubicOut }}>
				<div class="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
					<div class="flex min-w-0 items-start gap-3">
						<div class="mt-0.5 rounded-full bg-pink-100 p-2.5 text-pink-600"><User class="h-5 w-5" /></div>
						<div class="min-w-0">
							<h2 class="truncate text-lg font-bold text-gray-900">{student.studentName || 'Unknown Student'}</h2>
							<p class="truncate text-xs text-gray-500">{student.studentEmail || '—'}</p>
						</div>
					</div>
					<button type="button" onclick={onClose} class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="Close"><X class="h-5 w-5" /></button>
				</div>

				<div class="space-y-4 px-5 py-4 sm:px-6">
					<!-- Trust score -->
					<div class="rounded-xl border border-gray-200 p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<ShieldCheck class="h-4 w-4 text-gray-400" />
								<span class="text-sm font-semibold text-gray-700">Trust score</span>
								<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset {tierClasses(student.trustTier)}">{student.trustTierLabel || 'Unrated'}</span>
							</div>
							<span class="text-2xl font-bold text-gray-900">{score}</span>
						</div>
						<div class="mt-3 h-2 rounded-full bg-gray-200">
							<div class="h-2 rounded-full {barClass(score)}" style={`width: ${Math.max(0, Math.min(100, score))}%`}></div>
						</div>
					</div>

					<!-- Metrics -->
					<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each [
							{ label: 'Requests', value: student.requestsTotal ?? 0 },
							{ label: 'Returned', value: student.requestsReturned ?? 0 },
							{ label: 'Obligations', value: student.activeObligations ?? 0 },
							{ label: 'Penalties', value: student.totalPenalties ?? 0 },
							{ label: 'Bonuses', value: student.totalBonuses ?? 0 }
						] as m (m.label)}
							<div class="rounded-xl bg-gray-50 p-3 text-center">
								<dd class="text-lg font-bold text-gray-900">{m.value}</dd>
								<dt class="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{m.label}</dt>
							</div>
						{/each}
					</dl>

					<!-- Borrowed items -->
					<div class="border-t border-gray-100 pt-3">
						<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Items borrowed in this range ({items.length})</p>
						{#if items.length === 0}
							<p class="py-4 text-center text-sm text-gray-400">No borrowing activity in this range.</p>
						{:else}
							<div class="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
								{#each items as e (e.id)}
									<div class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-2.5">
										<div class="min-w-0">
											<p class="flex items-center gap-1.5 truncate text-sm font-medium text-gray-900"><Layers class="h-3.5 w-3.5 shrink-0 text-gray-400" />{e.name}</p>
											<p class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400"><Calendar class="h-3 w-3" />{fmtDate(e.requestDate)} <span class="text-gray-300">·</span> <Hash class="h-3 w-3" />{shortReq(e.requestId)}</p>
										</div>
										<span class="shrink-0 text-sm font-bold text-pink-600">×{e.quantity}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
