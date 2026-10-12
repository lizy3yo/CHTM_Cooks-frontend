<script lang="ts">
	/**
	 * Log a deed of donation.
	 *
	 * Follows the college's Deed of Donation form: the representative, their
	 * program, the date donated, every item with its quantity and value, and
	 * the signed deed. A deed may instead carry only an official receipt
	 * number and an amount, which is recorded without changing stock.
	 */
	import { FileSignature, X, Plus, Trash2, Upload, LoaderCircle, FileText } from 'lucide-svelte';
	import { donationsAPI, type DonationProgram, type DonationResponse } from '$lib/api/donations';
	import { uploadInventoryImage } from '$lib/api/inventory';
	import { peso } from '$lib/utils/deedOfDonation';
	import { toastStore } from '$lib/stores/toast';

	interface Props {
		/** Existing inventory item names, offered as suggestions. */
		itemNames?: string[];
		onClose: () => void;
		onSaved?: (donations: DonationResponse[]) => void;
	}

	let { itemNames = [], onClose, onSaved }: Props = $props();

	const MAX_FILES = 5;
	const MAX_FILE_BYTES = 10 * 1024 * 1024;
	const PROGRAMS: { value: DonationProgram; label: string }[] = [
		{ value: 'BSHM', label: 'BSHM - Bachelor of Science in Hospitality Management' },
		{ value: 'BSTM', label: 'BSTM - Bachelor of Science in Tourism Management' }
	];

	interface ItemRow {
		key: number;
		itemName: string;
		quantity: number | null;
		unitCost: number | null;
		/** A new item is filed under this category. */
		type: 'Tools' | 'Equipment';
	}

	let nextKey = 1;
	const blankRow = (): ItemRow => ({ key: nextKey++, itemName: '', quantity: 1, unitCost: null, type: 'Tools' });

	let representativeName = $state('');
	let email = $state('');
	let program = $state<DonationProgram | ''>('');
	let dateDonated = $state(new Date().toISOString().split('T')[0]);
	let receiptOnly = $state(false);
	let rows = $state<ItemRow[]>([blankRow()]);
	let orNumber = $state('');
	let receiptAmount = $state<number | null>(null);
	let notes = $state('');
	let files = $state<File[]>([]);
	let saving = $state(false);

	const today = new Date().toISOString().split('T')[0];
	// The inventory can hold two items with the same name; suggest each once.
	const suggestions = $derived([...new Set(itemNames)].sort((a, b) => a.localeCompare(b)));
	const itemsTotal = $derived(rows.reduce((sum, r) => sum + (r.quantity || 0) * (r.unitCost || 0), 0));

	function addRow(): void {
		rows = [...rows, blankRow()];
	}

	function removeRow(key: number): void {
		rows = rows.length === 1 ? [blankRow()] : rows.filter((r) => r.key !== key);
	}

	function addFiles(input: HTMLInputElement): void {
		const picked = Array.from(input.files ?? []);
		input.value = '';

		const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
		if (tooBig) {
			toastStore.error(`${tooBig.name} is larger than 10 MB.`, 'File too large');
			return;
		}
		if (files.length + picked.length > MAX_FILES) {
			toastStore.error(`Attach up to ${MAX_FILES} files.`, 'Too many files');
			return;
		}
		files = [...files, ...picked];
	}

	function validate(): string | null {
		if (!representativeName.trim()) return 'Enter the name of the representative.';
		if (!program) return 'Choose the program.';
		if (!dateDonated) return 'Enter the date donated.';
		if (receiptOnly) {
			if (!orNumber.trim()) return 'Enter the OR number.';
			if (!receiptAmount || receiptAmount <= 0) return 'Enter the amount on the receipt.';
			return null;
		}
		const filled = rows.filter((r) => r.itemName.trim());
		if (filled.length === 0) return 'Add at least one donated item.';
		if (filled.some((r) => !r.quantity || r.quantity < 1)) return 'Every item needs a quantity of at least 1.';
		return null;
	}

	async function save(): Promise<void> {
		const problem = validate();
		if (problem) {
			toastStore.error(problem);
			return;
		}

		saving = true;
		try {
			const uploaded: string[] = [];
			for (const file of files) {
				uploaded.push((await uploadInventoryImage(file, 'deed')).url);
			}

			const result = await donationsAPI.createDeed({
				representativeName: representativeName.trim(),
				email: email.trim() || undefined,
				program: program as DonationProgram,
				dateDonated,
				orNumber: orNumber.trim() || undefined,
				declaredTotal: receiptOnly ? (receiptAmount ?? undefined) : itemsTotal || undefined,
				notes: notes.trim() || undefined,
				files: uploaded,
				items: receiptOnly
					? []
					: rows
							.filter((r) => r.itemName.trim())
							.map((r) => ({
								itemName: r.itemName.trim(),
								quantity: r.quantity ?? 1,
								unitCost: r.unitCost ?? undefined,
								toolsOrEquipment: r.type
							}))
			});

			toastStore.success(
				`${result.deed.reference} recorded for ${result.deed.representativeName}.`,
				'Deed of donation saved'
			);
			onSaved?.(result.donations);
			onClose();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Try again.', 'Could not save the deed');
		} finally {
			saving = false;
		}
	}

	const inputClass =
		'mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20';
	const labelClass = 'block text-xs font-bold uppercase tracking-wider text-gray-700';
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
	<div class="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
		<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
			<div class="flex items-center gap-2">
				<div class="rounded-lg bg-red-50 p-2 text-red-500">
					<FileSignature size={20} />
				</div>
				<div>
					<h2 class="text-lg font-bold text-gray-900">Log Deed of Donation</h2>
					<p class="text-xs text-gray-500">One deed with all of its donated items</p>
				</div>
			</div>
			<button
				type="button"
				onclick={onClose}
				aria-label="Close"
				class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
			>
				<X size={18} />
			</button>
		</div>

		<div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label for="deedRepresentative" class={labelClass}>Name of Representative *</label>
					<input
						id="deedRepresentative"
						type="text"
						bind:value={representativeName}
						placeholder="First Name, Middle Name, Last Name (e.g. Juan P. Santos)"
						class={inputClass}
					/>
				</div>
				<div>
					<label for="deedEmail" class={labelClass}>Email</label>
					<input
						id="deedEmail"
						type="email"
						bind:value={email}
						placeholder="202311564@gordoncollege.edu.ph"
						class={inputClass}
					/>
				</div>
				<div>
					<label for="deedDate" class={labelClass}>Date Donated *</label>
					<input id="deedDate" type="date" max={today} bind:value={dateDonated} class={inputClass} />
				</div>
			</div>

			<fieldset>
				<legend class={labelClass}>Program *</legend>
				<div class="mt-2 space-y-2">
					{#each PROGRAMS as option (option.value)}
						<label class="flex cursor-pointer items-center gap-2.5 text-sm text-gray-800">
							<input type="radio" name="deedProgram" value={option.value} bind:group={program} class="h-4 w-4 accent-red-600" />
							{option.label}
						</label>
					{/each}
				</div>
			</fieldset>

			<div>
				<div class="flex items-center justify-between gap-3">
					<span class={labelClass}>Donated Items + Value {receiptOnly ? '' : '*'}</span>
					<label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
						<input type="checkbox" bind:checked={receiptOnly} class="h-4 w-4 accent-red-600" />
						Official receipt only, no items
					</label>
				</div>

				{#if receiptOnly}
					<div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<label for="deedOrNumber" class="text-xs text-gray-500">OR number *</label>
							<input id="deedOrNumber" type="text" bind:value={orNumber} placeholder="22892" class={inputClass} />
						</div>
						<div>
							<label for="deedReceiptAmount" class="text-xs text-gray-500">Amount (Php) *</label>
							<input
								id="deedReceiptAmount"
								type="number"
								min="0"
								step="0.01"
								bind:value={receiptAmount}
								placeholder="0.00"
								class={inputClass}
							/>
						</div>
					</div>
					<p class="mt-2 text-xs text-gray-500">The amount is recorded. Nothing is added to stock.</p>
				{:else}
					<datalist id="deedItemNames">
						{#each suggestions as name (name)}
							<option value={name}></option>
						{/each}
					</datalist>

					<div class="mt-2 space-y-2">
						<div class="hidden grid-cols-[1fr_7rem_4.5rem_6.5rem_6rem_2rem] gap-2 text-[11px] font-semibold text-gray-500 sm:grid">
							<span>Item</span>
							<span>Type</span>
							<span>Quantity</span>
							<span>Value each (Php)</span>
							<span class="text-right">Line total</span>
							<span></span>
						</div>
						{#each rows as row, i (row.key)}
							<div class="grid grid-cols-[1fr_1fr_2rem] items-center gap-2 sm:grid-cols-[1fr_7rem_4.5rem_6.5rem_6rem_2rem]">
								<input
									type="text"
									list="deedItemNames"
									bind:value={row.itemName}
									placeholder="Frying Pan"
									aria-label="Item {i + 1} name"
									class="col-span-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 sm:col-span-1"
								/>
								<select bind:value={row.type} aria-label="Item {i + 1} type" class="col-span-3 bg-white block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 sm:col-span-1">
									<option>Tools</option>
									<option>Equipment</option>
								</select>
								<input
									type="number"
									min="1"
									step="1"
									bind:value={row.quantity}
									placeholder="Qty"
									aria-label="Item {i + 1} quantity"
									class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
								/>
								<input
									type="number"
									min="0"
									step="0.01"
									bind:value={row.unitCost}
									placeholder="600.00"
									aria-label="Item {i + 1} value each"
									class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
								/>
								<span class="hidden text-right text-sm font-medium text-gray-800 sm:block">
									{peso((row.quantity || 0) * (row.unitCost || 0))}
								</span>
								<button
									type="button"
									onclick={() => removeRow(row.key)}
									aria-label="Remove item {i + 1}"
									class="justify-self-end rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
								>
									<Trash2 size={15} />
								</button>
							</div>
						{/each}
					</div>

					<div class="mt-3 flex items-center justify-between">
						<button
							type="button"
							onclick={addRow}
							class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
						>
							<Plus size={14} /> Add another item
						</button>
						<p class="text-sm text-gray-600">
							Total value of the items: <span class="font-bold text-gray-900">{peso(itemsTotal)}</span>
						</p>
					</div>
					<p class="mt-2 text-xs text-gray-500">
						An item that is already in the inventory is added to it. A new name creates a new inventory item under Tools or Equipment.
					</p>

					<div class="mt-3">
						<label for="deedOrNumberOptional" class="text-xs text-gray-500">OR number, if any</label>
						<input id="deedOrNumberOptional" type="text" bind:value={orNumber} class={inputClass} />
					</div>
				{/if}
			</div>

			<div>
				<span class={labelClass}>Signed Deed of Donation</span>
				<p class="mt-1 text-xs text-gray-500">
					Up to {MAX_FILES} files, PDF or image, 10 MB each. You can also upload it later from the donation's details.
				</p>
				{#if files.length}
					<ul class="mt-2 space-y-1.5">
						{#each files as file, i (file.name + i)}
							<li class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
								<span class="flex min-w-0 items-center gap-2 text-gray-800">
									<FileText size={15} class="shrink-0 text-gray-400" />
									<span class="truncate">{file.name}</span>
								</span>
								<button
									type="button"
									onclick={() => (files = files.filter((_, index) => index !== i))}
									aria-label="Remove {file.name}"
									class="rounded p-1 text-gray-400 hover:text-red-600"
								>
									<X size={14} />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if files.length < MAX_FILES}
					<label
						class="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
					>
						<Upload size={15} /> Add file
						<input
							type="file"
							accept="application/pdf,image/*"
							multiple
							class="sr-only"
							onchange={(e) => addFiles(e.currentTarget)}
						/>
					</label>
				{/if}
			</div>

			<div>
				<label for="deedNotes" class={labelClass}>Notes</label>
				<textarea id="deedNotes" rows="2" bind:value={notes} class={inputClass}></textarea>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
			<button
				type="button"
				onclick={onClose}
				disabled={saving}
				class="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={save}
				disabled={saving}
				class="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
			>
				{#if saving}
					<LoaderCircle size={15} class="animate-spin" /> Saving…
				{:else}
					Save deed
				{/if}
			</button>
		</div>
	</div>
</div>
