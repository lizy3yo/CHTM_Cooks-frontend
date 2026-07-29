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
	return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

async function loadLogo(wb: any, url: string): Promise<number | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const buf = await res.arrayBuffer();
		const bytes = new Uint8Array(buf);
		let bin = '';
		for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
		const base64 = 'data:image/png;base64,' + btoa(bin);
		return wb.addImage({ base64, extension: 'png' });
	} catch {
		return null;
	}
}

function buildSheet(
	wb: any,
	spec: SectionSpec,
	logoIds: (number | null)[],
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

	// Logos anchored in columns A, B, C (do not resize the columns).
	logoIds.forEach((id, i) => {
		if (id == null) return;
		sheet.addImage(id, {
			tl: { col: i + 0.18, row: 1.35 },
			ext: { width: 74, height: 74 }
		});
	});

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

	const logoIds = await Promise.all(LOGO_URLS.map((u) => loadLogo(wb, u)));
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
		buildSheet(wb, { name: 'Overview', band: `OVERVIEW — ${opts.rangeLabel}`, header: ['Metric', 'Value'], rows, widths: [30, 18] }, logoIds, meta);
	}

	if (want('borrowing')) {
		const rows = br.itemEntries.map((e) => [e.name, e.category, e.studentName, e.studentEmail, e.quantity, fmtDate(e.requestDate, true), fmtStatus(e.requestStatus)]);
		buildSheet(wb, { name: 'Borrowing', band: 'BORROWED ITEMS', header: ['Item', 'Category', 'Borrower', 'Email', 'Qty', 'Date', 'Status'], rows, widths: [26, 16, 20, 24, 8, 20, 16] }, logoIds, meta);
	}

	if (want('inventory')) {
		const rows = inv.eomVariance.map((i) => [i.name, i.category, i.quantity, i.eomCount, i.variance]);
		buildSheet(wb, { name: 'Inventory Variance', band: 'INVENTORY VARIANCE', header: ['Item', 'Category', 'Current', 'EOM', 'Variance'], rows, widths: [28, 18, 12, 12, 12] }, logoIds, meta);
		if (inv.stockAdjustments.length) {
			const aRows = inv.stockAdjustments.map((a) => [a.itemName, a.quantity > 0 ? 'Restock' : 'Loss/Damage', a.quantity, a.purpose ?? '', a.notes ?? '', fmtDate(a.createdAt ?? a.date)]);
			buildSheet(wb, { name: 'Stock Adjustments', band: 'STOCK ADJUSTMENTS', header: ['Item', 'Type', 'Qty', 'Reason', 'Notes', 'Date'], rows: aRows, widths: [26, 16, 8, 22, 24, 18] }, logoIds, meta);
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
			buildSheet(wb, { name: 'Donor Contributions', band: 'DONOR CONTRIBUTIONS', header: ['Donor', 'Item', 'Qty', 'Unit', 'Purpose', 'Receipt', 'Date'], rows: dRows, widths: [24, 26, 8, 12, 24, 18, 18] }, logoIds, meta);
		}
	}

	if (want('students')) {
		const rows = opts.report.studentRisk.trustScores.map((s) => [s.studentName, s.studentEmail, s.trustScore ?? 0, s.trustTierLabel ?? '', s.requestsTotal ?? 0, s.requestsReturned ?? 0, s.activeObligations ?? 0]);
		buildSheet(wb, { name: 'Student Risk', band: 'STUDENT RISK — TRUST SCORES', header: ['Student', 'Email', 'Trust Score', 'Tier', 'Requests', 'Returned', 'Obligations'], rows, widths: [24, 26, 12, 14, 12, 12, 14] }, logoIds, meta);
	}

	if (want('walk-in')) {
		const rows = opts.report.walkIns.transactions.map((t) => [t.id, t.studentName, t.classCode, t.items.map((it) => `${it.name} x${it.quantity}`).join('; '), fmtDate(t.borrowDate, true), fmtDate(t.returnDate), t.status === 'borrowed' ? 'Out' : t.status === 'returned' ? 'Returned' : 'Issue']);
		buildSheet(wb, { name: 'Walk-in Transactions', band: 'WALK-IN TRANSACTIONS', header: ['Reference', 'Borrower', 'Class', 'Items', 'Borrowed', 'Due', 'Status'], rows, widths: [16, 22, 14, 30, 20, 16, 12] }, logoIds, meta);
	}

	// Guarantee at least one sheet so ExcelJS can write a valid workbook.
	if (wb.worksheets.length === 0) {
		buildSheet(wb, { name: 'Report', band: 'ANALYTICS REPORT', header: ['Info'], rows: [['No sections selected.']], widths: [40] }, logoIds, meta);
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
