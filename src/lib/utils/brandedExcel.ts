/**
 * Shared CHTM-branded Excel layout used by every styled export (analytics
 * reports, inventory): the three Gordon College / CHTM seals, a centred
 * college header, a pink meta box (Date Generated / Report Type / Counted by /
 * Verified by), a pink section band, a pink header row with white text, and
 * zebra-striped data rows. Runs in the browser with ExcelJS.
 */

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

export interface SectionSpec {
	name: string; // worksheet tab name
	band: string; // pink section band label
	header: string[]; // column headers
	rows: (string | number)[][];
	widths?: number[]; // optional column widths
}

/** Date (optionally with time) as "Sep 12, 2026" / "Sep 12, 2026, 08:00 AM". */
export function fmtDate(iso?: string | null, withTime = false): string {
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

// ── Header logos ────────────────────────────────────────────────────────────
// The three seals are laid out as one evenly spaced group, centred across the
// logo band (columns A–C) and vertically centred in the header rows (2–5), at a
// common height with each image's own aspect ratio. Positions are computed in
// real pixels and written as native EMU offsets: ExcelJS's fractional
// `{ col, row }` anchors scale offsets by width × 10000 rather than real EMUs,
// which is what left the logos hugging the left edge of uneven columns.
const LOGO_MAX_PX = 124; // logo height (and max width); header rows 2–5 are ~181px tall
const LOGO_GAP_PX = 20; // space between neighbouring logos
const LOGO_EDGE_PX = 14; // minimum space from the band's edges
const EMU_PER_PX = 9525;
const DEFAULT_COL_WIDTH = 18; // matches the column-width fallback in buildSheet

export interface Logo {
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

export function buildBrandedSheet(
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

/** Fetch the three header seals once per workbook. */
export async function loadBrandLogos(wb: any): Promise<(Logo | null)[]> {
	return Promise.all(LOGO_URLS.map((u) => loadLogo(wb, u)));
}

/** Write the workbook and hand it to the browser as a download. */
export async function saveWorkbook(wb: any, fileName: string): Promise<void> {
	const buffer = await wb.xlsx.writeBuffer();
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
