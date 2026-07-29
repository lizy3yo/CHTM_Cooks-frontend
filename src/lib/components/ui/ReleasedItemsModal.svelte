<script lang="ts">
	import { onMount } from 'svelte';
	import { inventoryItemsAPI } from '$lib/api/inventory';
	import { toastStore } from '$lib/stores/toast';
	import { Users, Search, X, Package } from 'lucide-svelte';

	interface Props {
		onClose: () => void;
	}
	let { onClose }: Props = $props();

	let loading = $state(true);
	let records = $state<any[]>([]);
	let search = $state('');

	onMount(async () => {
		try {
			const res = await inventoryItemsAPI.getAllBorrowers();
			records = res.borrowers || [];
		} catch {
			toastStore.error('Failed to load released items');
		} finally {
			loading = false;
		}
	});

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return records;
		return records.filter(
			(r) =>
				(r.item_name || '').toLowerCase().includes(q) ||
				(r.student?.name || '').toLowerCase().includes(q) ||
				(r.class_code?.code || '').toLowerCase().includes(q)
		);
	});
	const totalQty = $derived(filtered.reduce((s, r) => s + (Number(r.quantity) || 0), 0));

	function fmtDate(iso?: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function isOverdue(iso?: string | null): boolean {
		if (!iso) return false;
		const d = new Date(iso);
		return !isNaN(d.getTime()) && d.getTime() < Date.now();
	}
	function statusColor(s?: string): string {
		if (s === 'borrowed') return 'bg-amber-50 text-amber-700 ring-amber-600/10';
		if (s === 'pending_return') return 'bg-blue-50 text-blue-700 ring-blue-600/10';
		if (s === 'missing') return 'bg-rose-50 text-rose-700 ring-rose-600/10';
		return 'bg-gray-100 text-gray-600 ring-gray-500/10';
	}
	function fmtStatus(s?: string): string {
		return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={onClose} aria-hidden="true"></div>

	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div
			role="dialog"
			aria-modal="true"
			class="animate-scaleIn relative w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
		>
			<!-- Header -->
			<div class="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
				<div class="flex min-w-0 items-start gap-3">
					<div class="mt-0.5 rounded-xl bg-blue-100 p-2.5 text-blue-600"><Users class="h-5 w-5" /></div>
					<div class="min-w-0">
						<h2 class="text-lg font-bold text-gray-900">Released / Out Items</h2>
						<p class="text-xs text-gray-500">Everything currently checked out — item, quantity, and who borrowed it.</p>
					</div>
				</div>
				<button type="button" onclick={onClose} class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="Close"><X class="h-5 w-5" /></button>
			</div>

			<div class="space-y-4 px-5 py-4 sm:px-6">
				<!-- Summary + search -->
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex gap-3">
						<div class="rounded-xl bg-blue-50 px-4 py-2 text-center">
							<p class="text-lg font-bold text-blue-700">{filtered.length}</p>
							<p class="text-[10px] font-medium uppercase tracking-wide text-blue-600">Records</p>
						</div>
						<div class="rounded-xl bg-gray-50 px-4 py-2 text-center">
							<p class="text-lg font-bold text-gray-900">{totalQty}</p>
							<p class="text-[10px] font-medium uppercase tracking-wide text-gray-500">Items out</p>
						</div>
					</div>
					<div class="relative max-w-xs flex-1">
						<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
						<input
							type="text"
							bind:value={search}
							placeholder="Search item, borrower, class…"
							class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:outline-none"
						/>
					</div>
				</div>

				<!-- Table -->
				<div class="max-h-[52vh] overflow-y-auto rounded-xl border border-gray-200">
					{#if loading}
						<div class="flex items-center justify-center py-16">
							<div class="h-8 w-8 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"></div>
						</div>
					{:else if filtered.length === 0}
						<div class="px-6 py-16 text-center">
							<Package class="mx-auto h-10 w-10 text-gray-300" />
							<p class="mt-3 text-sm font-semibold text-gray-700">Nothing is out right now</p>
							<p class="mt-1 text-xs text-gray-500">All items are currently available in the lab.</p>
						</div>
					{:else}
						<table class="min-w-full divide-y divide-gray-200 text-left text-xs sm:text-sm">
							<thead class="sticky top-0 bg-gray-50">
								<tr>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Item</th>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Borrower</th>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Class / Instructor</th>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Due</th>
									<th class="px-4 py-2.5 font-semibold uppercase tracking-wider text-gray-700">Status</th>
									<th class="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-gray-700">Qty</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each filtered as r (r.borrow_request_id + ':' + r.item_id)}
									<tr class="transition-colors hover:bg-gray-50/60">
										<td class="px-4 py-3">
											<div class="font-medium text-gray-900">{r.item_name || 'Unknown Item'}</div>
											<div class="text-xs text-gray-500">{r.item_specification || r.item_category || ''}</div>
										</td>
										<td class="px-4 py-3">
											<div class="font-medium text-gray-900">{r.student?.name || 'Unknown Student'}</div>
											<div class="text-xs text-gray-500">{r.student?.email || ''}</div>
										</td>
										<td class="px-4 py-3">
											<div class="font-medium text-gray-900">{r.class_code?.code || 'No class'}</div>
											<div class="text-xs text-gray-500">{r.instructor?.name || 'No instructor'}</div>
										</td>
										<td class="px-4 py-3 text-xs">
											<span class="{isOverdue(r.due_date) ? 'font-semibold text-rose-600' : 'text-gray-600'}">{fmtDate(r.due_date)}</span>
										</td>
										<td class="px-4 py-3">
											<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset {statusColor(r.status)}">{fmtStatus(r.status)}</span>
										</td>
										<td class="px-4 py-3 text-right font-semibold text-gray-900">{r.quantity}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-200 px-5 py-4 sm:px-6">
				<div class="flex justify-end">
					<button type="button" onclick={onClose} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95">Close</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes scaleIn {
		from { opacity: 0; transform: scale(0.97); }
		to { opacity: 1; transform: scale(1); }
	}
	.animate-scaleIn { animation: scaleIn 0.2s ease-out; }
</style>
