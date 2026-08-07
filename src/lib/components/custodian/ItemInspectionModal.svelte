<script lang="ts">
	import type { BorrowRequestItem } from '$lib/api/borrowRequests';
	import { CheckCircle2, AlertTriangle, XCircle, Package, Search, Plus, Minus, Calendar, User, Info, ShieldAlert, Check } from 'lucide-svelte';
	import { untrack } from 'svelte';

	interface Props {
		items: BorrowRequestItem[];
		requestId: string;
		onSubmit: (
			inspections: Array<{
				itemId: string;
				status: 'good' | 'damaged' | 'missing';
				notes: string;
				replacementQuantity?: number;
				dueDate?: string;
				additionalReturned?: number;
			}>
		) => Promise<void>;
		onCancel: () => void;
		studentName?: string;
		leaderName?: string;
		sessionDate?: string;
	}

	let { items, requestId, onSubmit, onCancel, studentName = 'N/A', leaderName = 'N/A', sessionDate }: Props = $props();

	interface ItemInspection {
		itemId: string;
		name: string;
		quantity: number;
		picture?: string | null;
		category: string;
		goodQty: number;
		damagedQty: number;
		missingQty: number;
		notes: string;
		additionalReturned: number;
		dueDate: string;
	}

	let inspections = $state<ItemInspection[]>([]);

	$effect(() => {
		const currentItems = items;

		untrack(() => {
			if (inspections.length === 0) {
				inspections = currentItems.map((item) => ({
					itemId: item.itemId,
					name: item.name,
					quantity: item.quantity,
					picture: item.picture ?? null,
					category: item.category ?? '',
					goodQty: item.quantity,
					damagedQty: 0,
					missingQty: 0,
					notes: '',
					additionalReturned: 0,
					dueDate: ''
				}));
			} else {
				const updatedInspections = [...inspections];
				for (const item of currentItems) {
					const existing = updatedInspections.find((i) => i.itemId === item.itemId);
					if (!existing) {
						updatedInspections.push({
							itemId: item.itemId,
							name: item.name,
							quantity: item.quantity,
							picture: item.picture ?? null,
							category: item.category ?? '',
							goodQty: item.quantity,
							damagedQty: 0,
							missingQty: 0,
							notes: '',
							additionalReturned: 0,
							dueDate: ''
						});
					} else {
						existing.name = item.name;
						if (item.picture) existing.picture = item.picture;
					}
				}
				inspections = updatedInspections;
			}
		});
	});

	let submitting = $state(false);
	let error = $state<string | null>(null);

	function handleQuantityChange(itemId: string, field: 'damaged' | 'missing', value: number) {
		const inspection = inspections.find((i) => i.itemId === itemId);
		if (!inspection) return;

		const val = Math.max(0, value);
		if (field === 'damaged') {
			const maxDamaged = inspection.quantity - inspection.missingQty;
			inspection.damagedQty = Math.min(val, maxDamaged);
		} else if (field === 'missing') {
			const maxMissing = inspection.quantity - inspection.damagedQty;
			inspection.missingQty = Math.min(val, maxMissing);
		}

		// Recalculate good quantity
		inspection.goodQty = inspection.quantity - inspection.damagedQty - inspection.missingQty;
	}

	function setAllGood() {
		for (const inspection of inspections) {
			inspection.goodQty = inspection.quantity;
			inspection.damagedQty = 0;
			inspection.missingQty = 0;
			inspection.additionalReturned = 0;
			inspection.notes = '';
			inspection.dueDate = '';
		}
	}

	const hasIssues = $derived(
		inspections.some((i) => i.damagedQty > 0 || i.missingQty > 0)
	);

	const totalExpected = $derived(inspections.reduce((sum, i) => sum + i.quantity, 0));
	const totalGood = $derived(inspections.reduce((sum, i) => sum + i.goodQty, 0));
	const totalDamaged = $derived(inspections.reduce((sum, i) => sum + i.damagedQty, 0));
	const totalMissing = $derived(inspections.reduce((sum, i) => sum + i.missingQty, 0));
	const totalAdditional = $derived(inspections.reduce((sum, i) => sum + i.additionalReturned, 0));

	function getItemIcon(name: string) {
		const normalized = name.toLowerCase();
		if (normalized.includes('knife')) return Package;
		if (normalized.includes('bowl')) return Package;
		if (normalized.includes('scale')) return Package;
		if (normalized.includes('mixer')) return Package;
		if (normalized.includes('processor')) return Package;
		return Package;
	}

	async function handleSubmit() {
		submitting = true;
		error = null;

		try {
			// Validate that due dates are provided for all items that are damaged or missing
			for (const i of inspections) {
				if (i.damagedQty > 0 || i.missingQty > 0) {
					if (!i.dueDate) {
						throw new Error(`Please specify a due date for replacement of "${i.name}".`);
					}
					if (!i.notes.trim()) {
						throw new Error(`Please provide Remarks for damaged/missing "${i.name}".`);
					}
				}
			}

			const payload = inspections.map((i) => {
				const replacementQty = i.damagedQty + i.missingQty;
				let derivedStatus: 'good' | 'damaged' | 'missing' = 'good';
				if (i.missingQty > 0) {
					derivedStatus = 'missing';
				} else if (i.damagedQty > 0) {
					derivedStatus = 'damaged';
				}

				const breakdown = `[Quantities - Good: ${i.goodQty}, Damaged: ${i.damagedQty}, Missing: ${i.missingQty}]`;
				const overReturn = i.additionalReturned > 0 ? ` Over-return: +${i.additionalReturned}` : '';
				const finalNotes = `${breakdown}${overReturn}${i.notes ? ' | Remarks: ' + i.notes : ''}`;

				const baseInspection: any = {
					itemId: i.itemId,
					status: derivedStatus,
					notes: finalNotes,
					additionalReturned: i.additionalReturned || 0,
					...(derivedStatus !== 'good' && replacementQty > 0 ? { replacementQuantity: replacementQty } : {}),
					...(i.dueDate ? { dueDate: i.dueDate } : {})
				};

				return baseInspection;
			});

			console.log('[ItemInspectionModal] Submitting inspection payload:', payload);
			await onSubmit(payload);
			console.log('[ItemInspectionModal] Inspection submitted successfully');
		} catch (err) {
			console.error('[ItemInspectionModal] Inspection submission failed:', err);
			error = err instanceof Error ? err.message : 'Failed to submit inspection';
			submitting = false;
		}
	}

	// Format display dates
	function formatSessionDate(dateStr?: string) {
		if (!dateStr) return 'N/A';
		try {
			return new Date(dateStr).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}
</script>

<!-- Modal Container -->
<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
		onclick={onCancel}
		aria-label="Close modal"
		tabindex="-1"
	></button>

	<!-- Modal -->
	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div
			class="animate-scaleIn relative mx-0 w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-4xl sm:rounded-3xl flex flex-col max-h-[90vh]"
			role="dialog"
			aria-labelledby="modal-title"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-14 sm:w-14 sm:rounded-2xl"
						>
							<Search class="h-6 w-6 text-white sm:h-7 sm:w-7" />
						</div>

						<div class="min-w-0">
							<h2 id="modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">
								Return Inspection
							</h2>
							<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">
								Inspect everything borrowed for this lab session in a single checklist
							</p>
						</div>
					</div>

					<div class="flex items-center gap-3">
						<button
							type="button"
							onclick={setAllGood}
							class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 hover:text-emerald-800 active:scale-95"
							title="Mark all items as 100% returned in good condition"
						>
							<Check class="h-3.5 w-3.5" /> Mark All Good
						</button>

						<button
							type="button"
							onclick={onCancel}
							class="shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
							aria-label="Close modal"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>

				<!-- Session details banner -->
				<div class="mt-4 grid grid-cols-1 gap-2.5 rounded-xl border border-pink-100 bg-pink-50/50 p-3 text-xs sm:grid-cols-3 sm:p-4">
					<div class="flex items-center gap-2 text-gray-700">
						<User class="h-4 w-4 shrink-0 text-pink-500" />
						<div class="truncate">
							<span class="font-semibold text-gray-500 block uppercase tracking-wider text-[9px]">Borrower Student</span>
							<span class="font-bold text-gray-900">{studentName}</span>
						</div>
					</div>
					<div class="flex items-center gap-2 text-gray-700 border-t border-gray-100 pt-2 sm:border-t-0 sm:border-l sm:border-pink-100 sm:pt-0 sm:pl-4">
						<User class="h-4 w-4 shrink-0 text-pink-500" />
						<div class="truncate">
							<span class="font-semibold text-gray-500 block uppercase tracking-wider text-[9px]">Lab Leader/Instructor</span>
							<span class="font-bold text-gray-900">{leaderName}</span>
						</div>
					</div>
					<div class="flex items-center gap-2 text-gray-700 border-t border-gray-100 pt-2 sm:border-t-0 sm:border-l sm:border-pink-100 sm:pt-0 sm:pl-4">
						<Calendar class="h-4 w-4 shrink-0 text-pink-500" />
						<div>
							<span class="font-semibold text-gray-500 block uppercase tracking-wider text-[9px]">Lab Session Date</span>
							<span class="font-bold text-gray-900">{formatSessionDate(sessionDate)}</span>
						</div>
					</div>
				</div>

				<!-- Return Summary Card -->
				<div class="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-4 sm:p-5">
					<h3 class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Inspection Summary</h3>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
						<div class="bg-white border border-gray-200 rounded-xl p-2.5">
							<span class="block text-[9px] uppercase font-bold text-gray-400">Total Borrowed</span>
							<span class="text-sm font-extrabold text-gray-900">{totalExpected}</span>
						</div>
						<div class="bg-white border border-gray-200 rounded-xl p-2.5">
							<span class="block text-[9px] uppercase font-bold text-emerald-500">Good Returned</span>
							<span class="text-sm font-extrabold text-emerald-600">{totalGood}</span>
						</div>
						<div class="bg-white border border-gray-200 rounded-xl p-2.5">
							<span class="block text-[9px] uppercase font-bold text-amber-500">Damaged</span>
							<span class="text-sm font-extrabold {totalDamaged > 0 ? 'text-amber-600' : 'text-gray-400'}">{totalDamaged}</span>
						</div>
						<div class="bg-white border border-gray-200 rounded-xl p-2.5">
							<span class="block text-[9px] uppercase font-bold text-rose-500">Missing</span>
							<span class="text-sm font-extrabold {totalMissing > 0 ? 'text-rose-600' : 'text-gray-400'}">{totalMissing}</span>
						</div>
						<div class="bg-white border border-gray-200 rounded-xl p-2.5 col-span-2 sm:col-span-1">
							<span class="block text-[9px] uppercase font-bold text-blue-500">Over-Returned</span>
							<span class="text-sm font-extrabold {totalAdditional > 0 ? 'text-blue-600' : 'text-gray-400'}">+{totalAdditional}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Content Area (Scrollable) -->
			<div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
				{#if error}
					<div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
						<div class="flex items-center gap-3">
							<AlertTriangle class="h-5 w-5 shrink-0 text-rose-500" />
							<p class="text-sm font-medium text-rose-800">{error}</p>
						</div>
					</div>
				{/if}

				<!-- Return Checklist Items -->
				<div class="space-y-4">
					{#each inspections as inspection (inspection.itemId)}
						{@const Icon = getItemIcon(inspection.name)}
						<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 transition-colors">
							<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<!-- Item Identity -->
								<div class="flex items-center gap-3">
									{#if inspection.picture}
										<img
											src={inspection.picture}
											alt={inspection.name}
											class="h-12 w-12 rounded-lg border border-gray-200 object-cover"
											loading="lazy"
											onerror={() => {
												inspection.picture = null;
											}}
										/>
									{:else}
										<div class="flex h-12 w-12 items-center justify-center rounded-lg border border-pink-100 bg-pink-50">
											<Icon class="h-6 w-6 text-pink-400" />
										</div>
									{/if}

									<div>
										<h4 class="font-bold text-gray-900 leading-snug">{inspection.name}</h4>
										<p class="text-[10px] text-gray-500 uppercase font-semibold tracking-wider mt-0.5">{inspection.category || 'Kitchenware'}</p>
									</div>
								</div>

								<!-- Counters & Qty adjusters -->
								<div class="flex flex-wrap items-center gap-4 bg-gray-50/80 px-3 py-2 rounded-xl border border-gray-100 self-start sm:self-auto">
									<!-- Total Borrowed -->
									<div class="flex flex-col items-center px-2">
										<span class="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Borrowed</span>
										<span class="text-sm font-extrabold text-gray-700">{inspection.quantity}</span>
									</div>

									<div class="h-6 w-px bg-gray-200"></div>

									<!-- Good condition badge -->
									<div class="flex flex-col items-center px-2">
										<span class="text-[9px] uppercase font-bold text-emerald-500 tracking-wider">Good</span>
										<span class="text-sm font-extrabold text-emerald-600">{inspection.goodQty}</span>
									</div>

									<!-- Damaged quantity adjuster -->
									<div class="flex flex-col items-center">
										<span class="text-[9px] uppercase font-bold text-amber-600 tracking-wider mb-1">Damaged</span>
										<div class="flex items-center border border-amber-200 rounded-lg bg-white overflow-hidden shadow-xs">
											<button
												type="button"
												onclick={() => handleQuantityChange(inspection.itemId, 'damaged', inspection.damagedQty - 1)}
												disabled={inspection.damagedQty <= 0}
												class="px-1.5 py-1 text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent"
											>
												<Minus class="h-3 w-3" />
											</button>
											<input
												type="number"
												min="0"
												max={inspection.quantity - inspection.missingQty}
												value={inspection.damagedQty}
												oninput={(e) => handleQuantityChange(inspection.itemId, 'damaged', parseInt(e.currentTarget.value) || 0)}
												class="w-8 border-none p-0 text-center text-xs font-bold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
											<button
												type="button"
												onclick={() => handleQuantityChange(inspection.itemId, 'damaged', inspection.damagedQty + 1)}
												disabled={inspection.damagedQty >= inspection.quantity - inspection.missingQty}
												class="px-1.5 py-1 text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent"
											>
												<Plus class="h-3 w-3" />
											</button>
										</div>
									</div>

									<!-- Missing quantity adjuster -->
									<div class="flex flex-col items-center">
										<span class="text-[9px] uppercase font-bold text-rose-600 tracking-wider mb-1">Missing</span>
										<div class="flex items-center border border-rose-200 rounded-lg bg-white overflow-hidden shadow-xs">
											<button
												type="button"
												onclick={() => handleQuantityChange(inspection.itemId, 'missing', inspection.missingQty - 1)}
												disabled={inspection.missingQty <= 0}
												class="px-1.5 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent"
											>
												<Minus class="h-3 w-3" />
											</button>
											<input
												type="number"
												min="0"
												max={inspection.quantity - inspection.damagedQty}
												value={inspection.missingQty}
												oninput={(e) => handleQuantityChange(inspection.itemId, 'missing', parseInt(e.currentTarget.value) || 0)}
												class="w-8 border-none p-0 text-center text-xs font-bold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
											<button
												type="button"
												onclick={() => handleQuantityChange(inspection.itemId, 'missing', inspection.missingQty + 1)}
												disabled={inspection.missingQty >= inspection.quantity - inspection.damagedQty}
												class="px-1.5 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent"
											>
												<Plus class="h-3 w-3" />
											</button>
										</div>
									</div>

									<!-- Over-return adjuster (always visible for layout consistency) -->
									<div class="h-6 w-px bg-gray-200"></div>
									<div class="flex flex-col items-center">
										<span class="text-[9px] uppercase font-bold text-blue-600 tracking-wider mb-1">Over-Return</span>
										<div class="flex items-center border border-blue-200 rounded-lg bg-white overflow-hidden shadow-xs">
											<button
												type="button"
												onclick={() => { inspection.additionalReturned = Math.max(0, inspection.additionalReturned - 1) }}
												disabled={inspection.additionalReturned <= 0}
												class="px-1.5 py-1 text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent"
											>
												<Minus class="h-3 w-3" />
											</button>
											<input
												type="number"
												min="0"
												value={inspection.additionalReturned}
												oninput={(e) => {
													const val = parseInt(e.currentTarget.value) || 0;
													inspection.additionalReturned = Math.max(0, val);
												}}
												class="w-8 border-none p-0 text-center text-xs font-bold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
											<button
												type="button"
												onclick={() => { inspection.additionalReturned += 1 }}
												class="px-1.5 py-1 text-blue-600 hover:bg-blue-50"
											>
												<Plus class="h-3 w-3" />
											</button>
										</div>
									</div>
								</div>
							</div>

							<!-- Damage/Discrepancy Logging Section -->
							{#if inspection.damagedQty > 0 || inspection.missingQty > 0}
								<div class="mt-3.5 border-t border-dashed border-gray-200 pt-3.5">
									<div class="rounded-xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4">
										<div class="flex items-start gap-2 mb-3">
											<ShieldAlert class="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
											<div>
												<p class="text-xs font-bold text-amber-900">
													Replacement Obligation Required
												</p>
												<p class="text-[11px] text-amber-700 mt-0.5">
													The borrower is liable to replace <span class="font-bold">{inspection.damagedQty + inspection.missingQty}</span> unit(s) of this item.
												</p>
											</div>
										</div>

										<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
											<div>
												<label for="due-date-{inspection.itemId}" class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
													Replacement Due Date <span class="text-rose-500">*</span>
												</label>
												<div class="relative">
													<input
														id="due-date-{inspection.itemId}"
														type="date"
														min={new Date().toISOString().split('T')[0]}
														bind:value={inspection.dueDate}
														onkeydown={(e) => e.preventDefault()}
														class="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-pink-500 focus:outline-none"
													/>
												</div>
											</div>

											<div>
												<label for="remarks-{inspection.itemId}" class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
													Damage/Loss Remarks <span class="text-rose-500">*</span>
												</label>
												<input
													id="remarks-{inspection.itemId}"
													type="text"
													bind:value={inspection.notes}
													placeholder="State details (e.g. cracked handle, lost during cleaning)"
													class="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-pink-500 focus:outline-none"
												/>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

			</div>

			<!-- Footer -->
			<div class="border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5 lg:px-8 flex items-center justify-between gap-4">
				<button
					type="button"
					onclick={onCancel}
					disabled={submitting}
					class="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
				>
					Cancel
				</button>

				<button
					type="button"
					onclick={handleSubmit}
					disabled={submitting}
					class="rounded-xl bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
				>
					{#if submitting}
						<span class="flex items-center justify-center gap-2">
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Processing...
						</span>
					{:else}
						Complete Return
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>
