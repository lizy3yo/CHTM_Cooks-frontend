import type { DonationResponse } from '$lib/api/donations';

/**
 * Deed of Donation, printed from a donation record.
 *
 * Opens a print-ready page in a new window. The deed is signed on paper by
 * the donor and the receiving staff; the signed copy is then uploaded back
 * onto the donation, which marks the deed as signed.
 */

const DONEE = 'Gordon College — College of Hospitality and Tourism Management';

function esc(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function longDate(iso: string | null | undefined): string {
	const d = iso ? new Date(iso) : new Date();
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function peso(amount: number | null | undefined): string {
	if (amount === null || amount === undefined) return '—';
	return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

/** @returns false when the browser blocked the new window. */
export function printDeedOfDonation(d: DonationResponse): boolean {
	const win = window.open('', '_blank', 'width=900,height=1000');
	if (!win) return false;

	const unit = d.unit || (d.quantity === 1 ? 'unit' : 'units');
	const valued = d.unitCost !== null && d.unitCost !== undefined;

	win.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Deed of Donation ${esc(d.receiptNumber)}</title>
<style>
	@page { size: A4; margin: 25mm 22mm; }
	body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #000; margin: 0; }
	h1 { text-align: center; font-size: 16pt; letter-spacing: 0.08em; margin: 0 0 4pt; }
	.ref { text-align: center; font-size: 10pt; margin: 0 0 22pt; }
	p { margin: 0 0 12pt; text-align: justify; }
	table { width: 100%; border-collapse: collapse; margin: 6pt 0 16pt; }
	th, td { border: 1px solid #000; padding: 5pt 8pt; text-align: left; font-size: 11pt; }
	th { background: #f0f0f0; }
	td.num, th.num { text-align: right; }
	.signatures { display: flex; gap: 28pt; margin-top: 46pt; }
	.signature { flex: 1; text-align: center; font-size: 11pt; }
	.line { border-top: 1px solid #000; margin-top: 44pt; padding-top: 4pt; font-weight: bold; }
	.role { font-size: 10pt; }
	.print { margin: 16px; text-align: center; }
	@media print { .print { display: none; } }
</style>
</head>
<body>
<div class="print"><button onclick="window.print()">Print</button></div>
<h1>DEED OF DONATION</h1>
<p class="ref">Reference No. ${esc(d.receiptNumber)}</p>

<p>KNOW ALL MEN BY THESE PRESENTS:</p>

<p>That <strong>${esc(d.donorName)}</strong> (the "Donor"), for and in consideration of goodwill and the
desire to support culinary and hospitality education, hereby voluntarily gives, transfers and conveys, by way of
donation, unto <strong>${esc(DONEE)}</strong> (the "Donee"), the following:</p>

<table>
	<thead>
		<tr>
			<th>Item</th>
			<th class="num">Quantity</th>
			<th class="num">Declared unit cost</th>
			<th class="num">Declared total value</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>${esc(d.itemName)}</td>
			<td class="num">${esc(d.quantity)} ${esc(unit)}</td>
			<td class="num">${valued ? esc(peso(d.unitCost)) : 'Not declared'}</td>
			<td class="num">${valued ? esc(peso(d.totalValue)) : 'Not declared'}</td>
		</tr>
	</tbody>
</table>

<p><strong>Purpose:</strong> ${esc(d.purpose || 'Item donation')}</p>

<p>The Donor declares that the items above are owned by the Donor, are free from any lien or encumbrance, and are
given without any condition other than their use for the purpose stated. The Donee accepts this donation and
acknowledges receipt of the items in the quantity stated on ${esc(longDate(d.date || d.createdAt))}.</p>

<p>IN WITNESS WHEREOF, the parties have signed this Deed on the date written beside their signatures.</p>

<div class="signatures">
	<div class="signature">
		<div class="line">${esc(d.donorName)}</div>
		<div class="role">Donor · Signature over printed name</div>
		<div class="role">Date: ____________________</div>
	</div>
	<div class="signature">
		<div class="line">${esc(d.recordedBy || '')}&nbsp;</div>
		<div class="role">Received by · Custodian</div>
		<div class="role">Date: ____________________</div>
	</div>
	<div class="signature">
		<div class="line">&nbsp;</div>
		<div class="role">Noted by · Dean</div>
		<div class="role">Date: ____________________</div>
	</div>
</div>
</body>
</html>`);
	win.document.close();
	win.focus();
	return true;
}
