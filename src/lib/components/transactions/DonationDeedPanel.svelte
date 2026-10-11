<script lang="ts">
	/**
	 * Declared value and deed of donation for one donation record.
	 *
	 * The deed is printed from the record, signed on paper, and a photo or scan
	 * of the signed copy is uploaded here, which marks the deed as signed.
	 */
	import { Printer, Upload, FileCheck, LoaderCircle } from 'lucide-svelte';
	import { donationsAPI, type DonationResponse } from '$lib/api/donations';
	import { uploadInventoryImage } from '$lib/api/inventory';
	import { peso, printDeedOfDonation } from '$lib/utils/deedOfDonation';
	import { toastStore } from '$lib/stores/toast';

	interface Props {
		donation: DonationResponse;
		/** Admins view the deed but do not print or upload. */
		readOnly?: boolean;
		onUpdated?: (donation: DonationResponse) => void;
	}

	let { donation, readOnly = false, onUpdated }: Props = $props();

	let uploading = $state(false);
	const signed = $derived(donation.deedStatus === 'signed');

	function print(): void {
		if (!printDeedOfDonation(donation)) {
			toastStore.error('Allow pop-ups for this site to print the deed.', 'Could not open the deed');
		}
	}

	async function uploadSigned(input: HTMLInputElement): Promise<void> {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		uploading = true;
		try {
			const uploaded = await uploadInventoryImage(file);
			const updated = await donationsAPI.attachDeed(donation.id, uploaded.url);
			onUpdated?.(updated);
			toastStore.success('The signed deed is on file.', 'Deed signed');
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Try again.', 'Could not upload the signed deed');
		} finally {
			uploading = false;
		}
	}

	function fmtDate(iso: string | null | undefined): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<section>
	<h4 class="mb-3 text-xs font-bold tracking-wider text-gray-500 uppercase">Declared Value</h4>
	<dl class="grid grid-cols-2 gap-3">
		<div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
			<dt class="text-xs text-gray-500">Cost per unit</dt>
			<dd class="mt-0.5 text-base font-bold text-gray-900">{peso(donation.unitCost)}</dd>
		</div>
		<div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
			<dt class="text-xs text-gray-500">Total donated value</dt>
			<dd class="mt-0.5 text-base font-bold text-gray-900">{peso(donation.totalValue)}</dd>
		</div>
	</dl>
	{#if donation.unitCost === null || donation.unitCost === undefined}
		<p class="mt-2 text-xs text-gray-500">No cost was declared for this donation.</p>
	{/if}
</section>

<section>
	<div class="mb-3 flex items-center justify-between gap-3">
		<h4 class="text-xs font-bold tracking-wider text-gray-500 uppercase">Deed of Donation</h4>
		<span
			class="rounded-full px-2.5 py-0.5 text-xs font-semibold {signed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}"
		>
			{signed ? `Signed${donation.deedSignedAt ? ` · ${fmtDate(donation.deedSignedAt)}` : ''}` : 'Pending signature'}
		</span>
	</div>

	<div class="flex flex-wrap gap-2">
		{#if !readOnly}
			<button
				type="button"
				onclick={print}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
			>
				<Printer size={15} /> Print deed
			</button>
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 {uploading ? 'pointer-events-none opacity-60' : ''}"
			>
				{#if uploading}
					<LoaderCircle size={15} class="animate-spin" /> Uploading…
				{:else}
					<Upload size={15} /> {signed ? 'Replace signed copy' : 'Upload signed copy'}
				{/if}
				<input type="file" accept="image/*" class="sr-only" disabled={uploading} onchange={(e) => uploadSigned(e.currentTarget)} />
			</label>
		{/if}
		{#if donation.deedFileUrl}
			<a
				href={donation.deedFileUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
			>
				<FileCheck size={15} /> View signed deed
			</a>
		{/if}
	</div>
	{#if !readOnly && !signed}
		<p class="mt-2 text-xs text-gray-500">Print the deed, have it signed, then upload a photo or scan of the signed page.</p>
	{/if}
</section>
