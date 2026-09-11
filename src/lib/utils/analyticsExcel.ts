/**
 * Client-side styled XLSX generator for the analytics reports.
 *
 * Mirrors the Inventory export design: the three Gordon College / CHTM seals,
 * a centered college header, a pink meta box (Date Generated / Report Type /
 * Counted by / Verified by), a pink section band, a pink header row with white
 * text, and zebra-striped data rows — one worksheet per selected section.
 *
 * Runs entirely in the browser (ExcelJS ships its own zip writer), so it needs
 * no server-side zip extension and produces a real .xlsx that opens in Excel.
 */
import type { AnalyticsReport } from '$lib/api/analyticsReports';
import { displayStatusKey } from '$lib/utils/statusDisplay';

// ── CHTM brand palette ──────────────────────────────────────────────────────
const PINK_HEADER = 'FFBE185D'; // header row / strong pink
const PINK_TEXT = 'FFBE185D';
const PINK_SECTION_BG = 'FFFCE7F3'; // section band (pink-100)
const PINK_META_BG = 'FFFDF2F8'; // meta labels (pink-50)
const ZEBRA = 'FFF9FAFB'; // gray-50
const WHITE = 'FFFFFFFF';
const DARK = 'FF111827'; // gray-900
const MUTED = 'FF6B7280'; // gray-500
const BORDER = 'FFE5E7EB'; // gray-200
const FONT = 'Calibri';
const HEADER_COLS = 7; // A–G header band

const LOGO_URLS = [
	'https://res.cloudinary.com/dqvhbvqnw/image/upload/v1779339673/GC_LOGO_p0cj6w.png',
	'https://res.cloudinary.com/dqvhbvqnw/image/upload/v1775488521/CHTM_LOGO_zkdl8h.png',
	'https://res.cloudinary.com/dqvhbvqnw/image/upload/v1779339673/CHTM-COOKS_LOGO_rgmfs4.png'
];

const thin = { style: 'thin' as const, color: { argb: BORDER } };
const boxBorder = { top: thin, left: thin, bottom: thin, right: thin };

type Cell = {
	fill?: unknown;
	border?: unknown;
	font?: unknown;
	alignment?: unknown;
	value: unknown;
};

interface SectionSpec {
	name: string; // worksheet tab name
	band: string; // pink section band label
	header: string[]; // column headers
	rows: (string | number)[][];
	widths?: number[]; // optional column widths
}

function fmtDate(iso?: string | null, withTime = false): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return String(iso);
	return d.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
	});
}
function fmtStatus(s?: string): string {
	return s ? displayStatusKey(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

// ── Header logos ────────────────────────────────────────────────────────────
// The three seals are laid out as one evenly spaced group, centred across the
// logo band (columns A–C) and vertically centred in the header rows (2–5), at a
// common height with each image's own aspect ratio. Positions are computed in
// real pixels and written as native EMU offsets: ExcelJS's fractional
// `{ col, row }` anchors scale offsets by width × 10000 rather than real EMUs,
// which is what left the logos hugging the left edge of uneven columns.
const LOGO_MAX_PX = 74; // logo height (and max width)
const LOGO_GAP_PX = 18; // space between neighbouring logos
const LOGO_EDGE_PX = 8; // minimum space from the band's edges
const EMU_PER_PX = 9525;
const DEFAULT_COL_WIDTH = 18; // matches the column-width fallback in buildSheet

interface Logo {
	id: number;
	width: number; // display size in px
	height: number;
}

/** Width/height from the PNG IHDR chunk, or null if the data isn't a PNG. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function loadLogo(wb: any, url: string): Promise<Logo | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const buf = await res.arrayBuffer();
		const bytes = new Uint8Array(buf);
		let bin = '';
		for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
		const base64 = 'data:image/png;base64,' + btoa(bin);
		const id = wb.addImage({ base64, extension: 'png' });

		// Fit inside a LOGO_MAX_PX box without distorting the seal.
		const size = pngSize(bytes);
		const scale = size ? LOGO_MAX_PX / Math.max(size.width, size.height) : 1;
		return {
			id,
			width: size ? Math.round(size.width * scale) : LOGO_MAX_PX,
			height: size ? Math.round(size.height * scale) : LOGO_MAX_PX
		};
	} catch {
		return null;
	}
}

/** Excel column width (characters) → pixels, for the default Calibri 11 font. */
function colWidthPx(chars: number): number {
	const maxDigitWidth = 7;
	return Math.trunc(((256 * chars + Math.trunc(128 / maxDigitWidth)) / 256) * maxDigitWidth);
}

/** Row height (points) → pixels at 96 DPI. */
function rowHeightPx(points: number): number {
	return (points * 96) / 72;
}

/** A pixel offset from the start of a run of cells → that cell's index + EMU offset. */
function toNative(offsetPx: number, sizesPx: number[], firstIndex: number) {
	let i = 0;
	let rest = Math.max(0, offsetPx);
	while (i < sizesPx.length - 1 && rest >= sizesPx[i]) {
		rest -= sizesPx[i];
		i++;
	}
	return { index: firstIndex + i, offset: Math.round(rest * EMU_PER_PX) };
}

function placeLogos(sheet: any, logos: (Logo | null)[], widths: number[]) {
	const shown = logos.filter((l): l is Logo => l !== null);
	if (shown.length === 0) return;

	const colsPx = [0, 1, 2].map((c) => colWidthPx(widths[c] ?? DEFAULT_COL_WIDTH)); // A–C
	const rowsPx = [2, 3, 4, 5].map((r) => rowHeightPx(sheet.getRow(r).height ?? 15)); // rows 2–5
	const bandW = colsPx.reduce((a, b) => a + b, 0);
	const bandH = rowsPx.reduce((a, b) => a + b, 0);

	// Shrink the whole group evenly only if the band is too narrow for it.
	const groupW = shown.reduce((sum, l) => sum + l.width, 0) + LOGO_GAP_PX * (shown.length - 1);
	const scale = Math.min(1, (bandW - 2 * LOGO_EDGE_PX) / groupW);

	let x = (bandW - groupW * scale) / 2;
	for (const logo of shown) {
		const w = logo.width * scale;
		const h = logo.height * scale;
		const col = toNative(x, colsPx, 0);
		const row = toNative((bandH - h) / 2, rowsPx, 1); // row 2 is index 1
		sheet.addImage(logo.id, {
			tl: { nativeCol: col.index, nativeColOff: col.offset, nativeRow: row.index, nativeRowOff: row.offset },
			ext: { width: Math.round(w), height: Math.round(h) },
			editAs: 'oneCell'
		});
		x += w + LOGO_GAP_PX * scale;
	}
}

function buildSheet(
	wb: any,
	spec: SectionSpec,
	logos: (Logo | null)[],
	meta: { rangeLabel: string; reportType: string; userName: string }
) {
	const sheet = wb.addWorksheet(spec.name, {
		views: [{ showGridLines: false }],
		pageSetup: { orientation: 'portrait' }
	});

	// Column widths (ensure A–G exist for the header band).
	const widths = spec.widths ?? spec.header.map((h) => Math.min(34, Math.max(14, h.length + 8)));
	for (let c = 1; c <= Math.max(HEADER_COLS, widths.length); c++) {
		sheet.getColumn(c).width = widths[c - 1] ?? 18;
	}

	// ── Header band (rows 2–5): logos A–C · title D–E · meta box F–G ──
	sheet.getRow(1).height = 6;
	for (let r = 2; r <= 5; r++) sheet.getRow(r).height = 34;

	const titleCell = sheet.getCell('D2');
	titleCell.value = {
		richText: [
			{ text: 'COLLEGE OF HOSPITALITY AND TOURISM MANAGEMENT\n', font: { name: FONT, bold: true, size: 12, color: { argb: DARK } } },
			{ text: 'GORDON COLLEGE\n', font: { name: FONT, bold: true, size: 11, color: { argb: DARK } } },
			{ text: 'OLONGAPO CITY', font: { name: FONT, size: 10, color: { argb: MUTED } } }
		]
	};
	titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
	sheet.mergeCells('D2:E5');

	const metaRows: [string, string][] = [
		['Date Generated', fmtDate(new Date().toISOString())],
		['Report Type', meta.reportType],
		['Counted by', meta.userName],
		['Verified by', '']
	];
	metaRows.forEach(([label, value], i) => {
		const row = 2 + i;
		const l = sheet.getCell(`F${row}`);
		l.value = label;
		l.font = { name: FONT, bold: true, size: 10, color: { argb: PINK_TEXT } };
		l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_META_BG } };
		l.alignment = { horizontal: 'left', vertical: 'middle' };
		l.border = boxBorder;
		const v = sheet.getCell(`G${row}`);
		v.value = value;
		v.font = { name: FONT, size: 10, color: { argb: DARK } };
		v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
		v.alignment = { horizontal: 'center', vertical: 'middle' };
		v.border = boxBorder;
	});

	// Logos: one centred, evenly spaced group across A–C (columns are not resized).
	placeLogos(sheet, logos, widths);

	// ── Section band (row 7) ──
	sheet.getRow(6).height = 6;
	sheet.mergeCells(`A7:G7`);
	const band = sheet.getCell('A7');
	band.value = spec.band;
	band.font = { name: FONT, bold: true, size: 12, color: { argb: PINK_TEXT } };
	band.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_SECTION_BG } };
	band.alignment = { horizontal: 'left', vertical: 'middle' };
	band.border = { top: { style: 'medium', color: { argb: PINK_HEADER } }, bottom: thin };
	sheet.getRow(7).height = 24;

	// ── Table header (row 8) ──
	const headerRow = sheet.getRow(8);
	spec.header.forEach((h, i) => {
		const cell = headerRow.getCell(i + 1);
		cell.value = h;
		cell.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_HEADER } };
		cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
		cell.border = boxBorder;
	});
	headerRow.height = 22;

	// ── Data rows ──
	if (spec.rows.length === 0) {
		const r = sheet.getRow(9);
		const c = r.getCell(1);
		c.value = 'No records in the selected range.';
		c.font = { name: FONT, italic: true, size: 10, color: { argb: MUTED } };
		sheet.mergeCells(9, 1, 9, spec.header.length);
	} else {
		spec.rows.forEach((cells, ri) => {
			const row = sheet.getRow(9 + ri);
			const alt = ri % 2 === 1;
			cells.forEach((val, ci) => {
				const cell = row.getCell(ci + 1);
				cell.value = val;
				cell.font = { name: FONT, size: 10, color: { argb: DARK } };
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? ZEBRA : WHITE } };
				cell.alignment = { horizontal: typeof val === 'number' ? 'right' : 'left', vertical: 'middle', wrapText: true };
				cell.border = boxBorder;
			});
		});
	}
}

export interface AnalyticsExcelOptions {
	report: AnalyticsReport;
	rangeLabel: string;
	filtersLabel: string;
	userName: string;
	sections: string[];
	fileName: string;
}

export async function downloadAnalyticsExcel(opts: AnalyticsExcelOptions): Promise<void> {
	// Interop: some bundlers expose the namespace, others the default export.
	const mod: any = await import('exceljs');
	const ExcelJS = mod.default ?? mod;
	const wb = new ExcelJS.Workbook();
	wb.creator = 'CHTM-Cooks System';
	wb.created = new Date();

	const logos = await Promise.all(LOGO_URLS.map((u) => loadLogo(wb, u)));
	const want = (id: string) => !opts.sections.length || opts.sections.includes(id);
	const meta = {
		rangeLabel: opts.rangeLabel,
		reportType: opts.filtersLabel && opts.filtersLabel !== 'None' ? opts.filtersLabel : 'All',
		userName: opts.userName || ''
	};
	const br = opts.report.borrowRequests;
	const inv = opts.report.inventory;

	if (want('overview')) {
		const total = br.itemEntries.length;
		const returned = br.itemEntries.filter((e) => e.requestStatus === 'returned').length;
		const rate = total > 0 ? Math.round((returned / total) * 100) : 0;
		const rows: (string | number)[][] = [
			['Total request entries', total],
			['Return rate (%)', rate],
			['Overdue items', br.overdueCount],
			['Avg items / request', br.borrowingAverages.avgItemsPerRequest],
			['Avg quantity / request', br.borrowingAverages.avgQuantityPerRequest]
		];
		for (const sb of br.statusBreakdown) rows.push([`Status: ${fmtStatus(sb.status)}`, sb.count]);
		buildSheet(wb, { name: 'Overview', band: `OVERVIEW — ${opts.rangeLabel}`, header: ['Metric', 'Value'], rows, widths: [30, 18] }, logos, meta);
	}

	if (want('borrowing')) {
		const rows = br.itemEntries.map((e) => [e.name, e.category, e.studentName, e.studentEmail, e.quantity, fmtDate(e.requestDate, true), fmtStatus(e.requestStatus)]);
		buildSheet(wb, { name: 'Borrowing', band: 'BORROWED ITEMS', header: ['Item', 'Category', 'Borrower', 'Email', 'Qty', 'Date', 'Status'], rows, widths: [26, 16, 20, 24, 8, 20, 16] }, logos, meta);
	}

	if (want('inventory')) {
		const rows = inv.eomVariance.map((i) => [i.name, i.category, i.quantity, i.eomCount, i.variance]);
		buildSheet(wb, { name: 'Inventory Variance', band: 'INVENTORY VARIANCE', header: ['Item', 'Category', 'Current', 'EOM', 'Variance'], rows, widths: [28, 18, 12, 12, 12] }, logos, meta);
		if (inv.stockAdjustments.length) {
			const aRows = inv.stockAdjustments.map((a) => [a.itemName, a.quantity > 0 ? 'Restock' : 'Loss/Damage', a.quantity, a.purpose ?? '', a.notes ?? '', fmtDate(a.createdAt ?? a.date)]);
			buildSheet(wb, { name: 'Stock Adjustments', band: 'STOCK ADJUSTMENTS', header: ['Item', 'Type', 'Qty', 'Reason', 'Notes', 'Date'], rows: aRows, widths: [26, 16, 8, 22, 24, 18] }, logos, meta);
		}
		if (inv.donationRecords?.length) {
			const dRows = inv.donationRecords.map((d) => [
				d.donorName,
				d.itemName,
				d.quantity,
				d.unit ?? '',
				d.purpose ?? '',
				d.receiptNumber ?? '',
				fmtDate(d.date ?? d.createdAt)
			]);
			buildSheet(wb, { name: 'Donor Contributions', band: 'DONOR CONTRIBUTIONS', header: ['Donor', 'Item', 'Qty', 'Unit', 'Purpose', 'Receipt', 'Date'], rows: dRows, widths: [24, 26, 8, 12, 24, 18, 18] }, logos, meta);
		}
	}

	if (want('students')) {
		const rows = opts.report.studentRisk.trustScores.map((s) => [s.studentName, s.studentEmail, s.trustScore ?? 0, s.trustTierLabel ?? '', s.requestsTotal ?? 0, s.requestsReturned ?? 0, s.activeObligations ?? 0]);
		buildSheet(wb, { name: 'Student Risk', band: 'STUDENT RISK — TRUST SCORES', header: ['Student', 'Email', 'Trust Score', 'Tier', 'Requests', 'Returned', 'Obligations'], rows, widths: [24, 26, 12, 14, 12, 12, 14] }, logos, meta);
	}

	if (want('walk-in')) {
		const rows = opts.report.walkIns.transactions.map((t) => [t.id, t.studentName, t.classCode, t.items.map((it) => `${it.name} x${it.quantity}`).join('; '), fmtDate(t.borrowDate, true), fmtDate(t.returnDate), t.status === 'borrowed' ? 'Out' : t.status === 'returned' ? 'Returned' : 'Issue']);
		buildSheet(wb, { name: 'Walk-in Transactions', band: 'WALK-IN TRANSACTIONS', header: ['Reference', 'Borrower', 'Class', 'Items', 'Borrowed', 'Due', 'Status'], rows, widths: [16, 22, 14, 30, 20, 16, 12] }, logos, meta);
	}

	// Guarantee at least one sheet so ExcelJS can write a valid workbook.
	if (wb.worksheets.length === 0) {
		buildSheet(wb, { name: 'Report', band: 'ANALYTICS REPORT', header: ['Info'], rows: [['No sections selected.']], widths: [40] }, logos, meta);
	}

	const buffer = await wb.xlsx.writeBuffer();
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = opts.fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
