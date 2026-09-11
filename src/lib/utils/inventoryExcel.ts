/**
 * Client-side styled XLSX export for Inventory Management.
 *
 * Same CHTM-branded layout as the analytics reports (brandedExcel.ts): seals,
 * college header, meta box, pink section band and header row, zebra rows.
 * One worksheet per sheet chosen in the export dialog.
 *
 * Column headers use names the inventory importer recognises (Item Name,
 * Category, Specification, Tools or Equipment, Donations, EOM Count, Picture),
 * so an exported file can be imported back; the letterhead rows above the
 * header row are skipped by the importer's header detection.
 */
import type { InventoryItem } from '$lib/api/inventory';
import {
	buildBrandedSheet,
	loadBrandLogos,
	saveWorkbook,
	withFullSizeLogoBand,
	type SectionSpec
} from '$lib/utils/brandedExcel';

export type InventorySheet = 'all-items' | 'items-tab' | 'required-tab';
export type InventoryOptionalColumn = 'category' | 'specification' | 'tools' | 'image';

export interface InventoryExcelOptions {
	/** Every inventory item, archived ones included (used by the All Items sheet). */
	items: InventoryItem[];
	sheets: string[];
	/** Optional columns ticked in the export dialog. Name and counts are always included. */
	columns: string[];
	/** Value filters from the dialog; an empty list means "no filter". */
	categories: string[];
	specifications: string[];
	tools: string[];
	userName: string;
	fileName: string;
}

interface ColumnDef {
	header: string;
	width: number;
	value: (item: InventoryItem) => string | number;
}

const num = (n: number | undefined | null) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

function columnsFor(optional: Set<string>, extra: ColumnDef[] = []): ColumnDef[] {
	const cols: ColumnDef[] = [{ header: 'Item Name', width: 30, value: (i) => i.name ?? '' }];
	if (optional.has('category')) cols.push({ header: 'Category', width: 18, value: (i) => i.category ?? '' });
	if (optional.has('specification')) cols.push({ header: 'Specification', width: 22, value: (i) => i.specification ?? '' });
	if (optional.has('tools')) cols.push({ header: 'Tools or Equipment', width: 20, value: (i) => i.toolsOrEquipment ?? '' });
	// Same three counts as the Inventory table (Total | Avail | Released), plus the stock ledger.
	cols.push(
		{ header: 'Total', width: 11, value: (i) => num(i.currentCount ?? num(i.available) + num(i.released)) },
		{ header: 'Available', width: 11, value: (i) => num(i.available ?? num(i.quantity) + num(i.donations)) },
		{ header: 'Released', width: 11, value: (i) => num(i.released) },
		{ header: 'Donations', width: 11, value: (i) => num(i.donations) },
		{ header: 'EOM Count', width: 11, value: (i) => num(i.eomCount) },
		...extra
	);
	if (optional.has('image')) cols.push({ header: 'Picture', width: 42, value: (i) => i.picture ?? '' });
	return cols;
}

function toSpec(name: string, band: string, items: InventoryItem[], cols: ColumnDef[]): SectionSpec {
	const all: ColumnDef[] = [{ header: '#', width: 6, value: () => '' }, ...cols];
	// Widen Item Name (column B) if needed so the header seals show at full size.
	const widths = withFullSizeLogoBand(
		all.map((c) => c.width),
		1
	);
	// The letterhead spans A–G (title in D–E, meta box in F–G): keep those
	// columns wide enough for it even when few optional columns are selected.
	for (let c = 3; c <= 6; c++) widths[c] = Math.max(widths[c] ?? 18, 17);
	return {
		name,
		band,
		header: all.map((c) => c.header),
		rows: items.map((item, index) => [index + 1, ...cols.map((c) => c.value(item))]),
		widths
	};
}

function sheetCount(n: number) {
	return `${n} ${n === 1 ? 'item' : 'items'}`;
}

export async function downloadInventoryExcel(opts: InventoryExcelOptions): Promise<void> {
	const mod: any = await import('exceljs');
	const ExcelJS = mod.default ?? mod;
	const wb = new ExcelJS.Workbook();
	wb.creator = 'CHTM-Cooks System';
	wb.created = new Date();

	const logos = await loadBrandLogos(wb);
	const meta = { rangeLabel: '', reportType: 'Inventory', userName: opts.userName || '' };
	const optional = new Set(opts.columns);

	// Dialog value filters (only for columns the user ticked).
	const inList = (list: string[], value: string | undefined) =>
		list.length === 0 || list.includes((value ?? '').trim());
	const filtered = opts.items.filter(
		(i) =>
			inList(opts.categories, i.category) &&
			inList(opts.specifications, i.specification) &&
			inList(opts.tools, i.toolsOrEquipment)
	);
	const byName = (a: InventoryItem, b: InventoryItem) => (a.name ?? '').localeCompare(b.name ?? '');
	const active = filtered.filter((i) => !i.archived).sort(byName);

	if (opts.sheets.includes('all-items')) {
		const everything = [...filtered].sort(byName);
		const cols = columnsFor(optional, [
			{ header: 'Archived', width: 11, value: (i) => (i.archived ? 'Yes' : 'No') }
		]);
		buildBrandedSheet(wb, toSpec('All Items', `ALL INVENTORY ITEMS — ${sheetCount(everything.length)}`, everything, cols), logos, meta);
	}

	if (opts.sheets.includes('items-tab')) {
		buildBrandedSheet(wb, toSpec('Items', `INVENTORY ITEMS — ${sheetCount(active.length)}`, active, columnsFor(optional)), logos, meta);
	}

	if (opts.sheets.includes('required-tab')) {
		const required = active.filter((i) => i.isrequired);
		const cols = columnsFor(optional, [
			{ header: 'Max per Request', width: 15, value: (i) => (i.maxQuantityPerRequest ?? '') as string | number }
		]);
		buildBrandedSheet(wb, toSpec('Required Items', `REQUIRED ITEMS — ${sheetCount(required.length)}`, required, cols), logos, meta);
	}

	// Guarantee at least one sheet so ExcelJS can write a valid workbook.
	if (wb.worksheets.length === 0) {
		buildBrandedSheet(wb, toSpec('Items', `INVENTORY ITEMS — ${sheetCount(active.length)}`, active, columnsFor(optional)), logos, meta);
	}

	await saveWorkbook(wb, opts.fileName);
}
