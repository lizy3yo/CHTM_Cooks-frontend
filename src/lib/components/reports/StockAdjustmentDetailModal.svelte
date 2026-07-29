<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { X, Package, Calendar, Clock } from 'lucide-svelte';

	interface Props {
		open: boolean;
		adj: {
			itemName?: string;
			quantity?: number;
			purpose?: string;
			notes?: string;
			date?: string;
			createdAt?: string;
		} | null;
		onClose: () => void;
	}
	let { open, adj, onClose }: Props = $props();

	const isRestock = $derived((adj?.quantity ?? 0) > 0);

	function fmtDate(d: string | undefined): string {
		if (!d) return '—';
		const dt = new Date(d);
		return isNaN(dt.getTime()) ? d.slice(0, 10) : dt.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
	const genericPurposes = ['Manual Stock Restock', 'Manual Stock Damage/Loss', 'Restock', 'Damage/Loss'];
	const shownPurpose = $derived(
		adj?.purpose && !genericPurposes.includes(adj.purpose) ? adj.purpose : ''
	);
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onClose(); }} />

{#if open && adj}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onclick={onClose}></button>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div class="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" in:fly={{ y: 16, duration: 220, easing: cubicOut }}>
				<div class="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
					<div class="flex min-w-0 items-start gap-3">
						<div class="mt-0.5 rounded-full bg-pink-100 p-2.5 text-pink-600"><Package class="h-5 w-5" /></div>
						<div class="min-w-0">
							<h2 class="truncate text-lg font-bold text-gray-900">{adj.itemName || 'Item'}</h2>
							<p class="text-xs text-gray-500">Stock adjustment</p>
						</div>
					</div>
					<button type="button" onclick={onClose} class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="Close"><X class="h-5 w-5" /></button>
				</div>

				<div class="space-y-4 px-5 py-4 sm:px-6">
					<div class="flex items-center justify-between rounded-xl border border-gray-200 p-4">
						<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold {isRestock ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
							{isRestock ? 'Restock' : 'Loss / Damage'}
						</span>
						<span class="text-2xl font-bold {isRestock ? 'text-emerald-700' : 'text-rose-700'}">
							{isRestock ? '+' : ''}{adj.quantity ?? 0}
						</span>
					</div>

					<dl class="space-y-3">
						<div>
							<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Reason</dt>
							<dd class="mt-0.5 text-sm text-gray-900">{shownPurpose || (isRestock ? 'Manual restock' : 'Damage / loss')}</dd>
						</div>
						<div>
							<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Notes</dt>
							<dd class="mt-0.5 text-sm text-gray-700">{adj.notes || 'No notes provided.'}</dd>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<dt class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><Calendar class="h-3 w-3" />Date</dt>
								<dd class="mt-0.5 text-sm text-gray-700">{fmtDate(adj.date)}</dd>
							</div>
							<div>
								<dt class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><Clock class="h-3 w-3" />Logged</dt>
								<dd class="mt-0.5 text-sm text-gray-700">{fmtDate(adj.createdAt)}</dd>
							</div>
						</div>
					</dl>
				</div>
			</div>
		</div>
	</div>
{/if}
