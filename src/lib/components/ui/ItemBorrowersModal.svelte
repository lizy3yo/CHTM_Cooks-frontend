<script lang="ts">
	import type { InventoryItem } from '$lib/api/inventory';
	import { inventoryItemsAPI } from '$lib/api/inventory';
	import { onMount } from 'svelte';
	import { toastStore } from '$lib/stores/toast';
	import { X, Users } from 'lucide-svelte';

	interface Props {
		item: InventoryItem;
		onClose: () => void;
	}

	let { item, onClose }: Props = $props();

	let borrowers = $state<any[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			const res = await inventoryItemsAPI.getAllBorrowers();
			// Filter by this item
			borrowers = (res.borrowers || []).filter((b: any) => String(b.item_id) === String(item.id));
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to load active borrowers');
		} finally {
			loading = false;
		}
	});

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '—';
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	function isOverdue(dueDateStr: string | null | undefined): boolean {
		if (!dueDateStr) return false;
		try {
			return new Date(dueDateStr) < new Date();
		} catch {
			return false;
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'borrowed':
				return 'bg-blue-50 text-blue-700 ring-blue-600/10';
			case 'pending_return':
				return 'bg-amber-50 text-amber-700 ring-amber-600/10';
			case 'pending_appeal':
				return 'bg-purple-50 text-purple-700 ring-purple-600/10';
			case 'missing':
				return 'bg-rose-50 text-rose-700 ring-rose-600/10';
			default:
				return 'bg-gray-50 text-gray-700 ring-gray-600/10';
		}
	}

	function formatStatus(status: string): string {
		switch (status) {
			case 'borrowed':
				return 'Checked Out';
			case 'pending_return':
				return 'Pending Return';
			case 'pending_appeal':
				return 'In Appeal';
			case 'missing':
				return 'Missing';
			default:
				return status.replace(/_/g, ' ');
		}
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
		onclick={onClose}
		aria-label="Close modal"
	></button>

	<!-- Modal Container -->
	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div class="relative w-full max-w-2xl sm:max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden mx-0 sm:mx-auto">
			<!-- Header -->
			<div class="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-bold text-gray-900 sm:text-xl">Active Borrowers</h2>
						<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">
							{item.name} {item.specification ? `(${item.specification})` : ''} · {item.category}
						</p>
					</div>
					<button
						type="button"
						onclick={onClose}
						class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:rounded-xl sm:p-2"
						aria-label="Close"
					>
						<X class="h-5 w-5 sm:h-6 sm:w-6" />
					</button>
				</div>
			</div>

			<!-- Summary Cards -->
			<div class="bg-gray-50 px-4 py-4 sm:px-6 lg:px-8 border-b border-gray-200">
				<div class="grid grid-cols-3 gap-3">
					<div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
						<div class="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Total Stock</div>
						<div class="mt-1 text-lg font-bold text-gray-900 sm:text-xl">{item.currentCount ?? (item.quantity + (item.donations ?? 0))}</div>
					</div>
					<div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
						<div class="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Available</div>
						<div class="mt-1 text-lg font-bold text-emerald-600 sm:text-xl">{item.available ?? (item.quantity + (item.donations ?? 0))}</div>
					</div>
					<div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
						<div class="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Released</div>
						<div class="mt-1 text-lg font-bold text-blue-600 sm:text-xl">{item.released ?? 0}</div>
					</div>
				</div>
			</div>

			<!-- Body -->
			<div class="max-h-[50vh] overflow-y-auto p-4 sm:p-6 lg:p-8">
				{#if loading}
					<div class="flex flex-col items-center justify-center py-12 space-y-3">
						<div class="h-8 w-8 animate-spin rounded-full border-4 border-pink-500 border-t-transparent"></div>
						<p class="text-sm text-gray-500">Loading active checkouts...</p>
					</div>
				{:else if borrowers.length === 0}
					<div class="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center sm:p-12">
						<Users class="mx-auto h-12 w-12 text-gray-400" />
						<h3 class="mt-4 text-sm font-semibold text-gray-900">No active checkouts</h3>
						<p class="mt-1 text-xs text-gray-500">This item is currently fully available in storage.</p>
					</div>
				{:else}
					<div class="overflow-x-auto rounded-xl border border-gray-200">
						<table class="min-w-full divide-y divide-gray-200 text-left text-xs sm:text-sm">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-4 py-2.5 font-semibold text-gray-700 uppercase tracking-wider">Borrower</th>
									<th class="px-4 py-2.5 font-semibold text-gray-700 uppercase tracking-wider">Class & Instructor</th>
									<th class="px-4 py-2.5 font-semibold text-gray-700 uppercase tracking-wider">Dates</th>
									<th class="px-4 py-2.5 font-semibold text-gray-700 uppercase tracking-wider">Status</th>
									<th class="px-4 py-2.5 font-semibold text-gray-700 uppercase tracking-wider text-right">Qty</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each borrowers as record}
									<tr class="hover:bg-gray-50/50 transition-colors">
										<td class="px-4 py-3">
											<div class="font-medium text-gray-900">{record.student?.name || 'Unknown Student'}</div>
											<div class="text-xs text-gray-500">{record.student?.email || ''}</div>
										</td>
										<td class="px-4 py-3">
											<div class="font-medium text-gray-900">{record.class_code?.code || 'No class'}</div>
											<div class="text-xs text-gray-500">Instructor: {record.instructor?.name || 'None'}</div>
										</td>
										<td class="px-4 py-3 space-y-0.5 text-xs text-gray-600">
											<div>Borrowed: <span class="font-medium">{formatDate(record.borrow_date)}</span></div>
											<div class="flex items-center gap-1">
												Due: 
												<span class="font-medium {isOverdue(record.due_date) ? 'text-rose-600 font-semibold' : ''}">
													{formatDate(record.due_date)}
												</span>
											</div>
										</td>
										<td class="px-4 py-3">
											<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset {getStatusColor(record.status)}">
												{formatStatus(record.status)}
											</span>
										</td>
										<td class="px-4 py-3 font-semibold text-gray-900 text-right">{record.quantity}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-200 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
				<div class="flex justify-end">
					<button
						type="button"
						onclick={onClose}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes scaleIn {
		from { opacity: 0; transform: scale(0.95); }
		to   { opacity: 1; transform: scale(1); }
	}
	.animate-scaleIn {
		animation: scaleIn 0.15s ease-out forwards;
	}
</style>
