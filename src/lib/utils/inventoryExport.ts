/**
 * Inventory "Export" button handler shared by the instructor, custodian, admin
 * and superadmin inventory pages: loads every item (archived included), then
 * builds the CHTM-branded workbook in the browser.
 */
import { get } from 'svelte/store';
import { inventoryItemsAPI, type InventoryItem } from '$lib/api/inventory';
import { user } from '$lib/stores/auth';
import { downloadInventoryExcel } from '$lib/utils/inventoryExcel';

export interface InventoryExportSelections {
	sheets: string[];
	columns: string[];
	categories: string[];
	specifications: string[];
	tools: string[];
}

const PAGE_SIZE = 500;

async function fetchAllItems(signal?: AbortSignal): Promise<InventoryItem[]> {
	const all: InventoryItem[] = [];
	let page = 1;
	let pages = 1;
	do {
		if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
		const res = await inventoryItemsAPI.getAll({ includeArchived: true, page, limit: PAGE_SIZE, forceRefresh: true });
		all.push(...(res.items ?? []));
		pages = res.pages || 1;
		page++;
	} while (page <= pages);
	return all;
}

export async function exportInventoryWorkbook(
	selections: InventoryExportSelections,
	signal?: AbortSignal
): Promise<void> {
	const items = await fetchAllItems(signal);
	if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

	const u = get(user);
	await downloadInventoryExcel({
		items,
		...selections,
		userName: u ? `${u.firstName} ${u.lastName}`.trim().toUpperCase() : '',
		fileName: `chtm-cooks-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`
	});
}
