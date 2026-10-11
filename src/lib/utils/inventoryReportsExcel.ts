import type { InventoryVarianceReport, ReturnedItemsReport } from '$lib/api/inventoryReports';
import { buildBrandedSheet, fmtDate, loadBrandLogos, saveWorkbook } from '$lib/utils/brandedExcel';

/** Branded workbooks for the inventory variance and the returned-items report. */

export const OVER_SOURCE_LABEL = {
	donation: 'Donation',
	replacement_surplus: 'Replacement surplus',
	over_return: 'Extra units returned',
	adjustment: 'Stock adjustment'
} as const;

export const UNDER_KIND_LABEL = {
	unreturned: 'Unreturned',
	damaged: 'Damaged',
	missing: 'Missing',
	adjustment: 'Stock adjustment'
} as const;

async function newWorkbook() {
	// Interop: some bundlers expose the namespace, others the default export.
	const mod: any = await import('exceljs');
	const ExcelJS = mod.default ?? mod;
	const wb = new ExcelJS.Workbook();
	wb.creator = 'CHTM-Cooks System';
	wb.created = new Date();
	return wb;
}

export async function downloadVarianceExcel(report: InventoryVarianceReport, userName: string): Promise<void> {
	const wb = await newWorkbook();
	const logos = await loadBrandLogos(wb);
	const meta = { rangeLabel: report.monthLabel, reportType: 'Inventory Variance', userName };

	buildBrandedSheet(
		wb,
		{
			name: 'Over',
			band: `OVER ITEMS — ${report.monthLabel.toUpperCase()}`,
			header: ['Item', 'Category', 'Qty', 'Source', 'From', 'Date', 'Reference', 'Details'],
			rows: report.over.map((e) => [
				e.itemName,
				e.category ?? '',
				e.quantity,
				OVER_SOURCE_LABEL[e.source],
				e.person ?? '',
				fmtDate(e.date),
				e.reference ?? '',
				e.reason ?? ''
			]),
			widths: [26, 18, 8, 22, 26, 14, 20, 36]
		},
		logos,
		meta
	);

	buildBrandedSheet(
		wb,
		{
			name: 'Under',
			band: `UNDER ITEMS — ${report.monthLabel.toUpperCase()}`,
			header: ['Item', 'Category', 'Qty', 'Type', 'Person', 'Reference', 'Since', 'Days', 'Days overdue', 'Due', 'Carried from', 'Reason'],
			rows: report.under.map((e) => [
				e.itemName,
				e.category ?? '',
				e.quantity,
				UNDER_KIND_LABEL[e.kind],
				e.person ?? '',
				e.reference ?? '',
				fmtDate(e.date),
				e.open ? e.daysOutstanding : '—',
				e.daysOverdue || '—',
				fmtDate(e.dueDate),
				e.carriedFrom ?? '',
				e.reason ?? ''
			]),
			widths: [26, 18, 8, 16, 26, 16, 14, 8, 13, 14, 16, 36]
		},
		logos,
		meta
	);

	if (report.unexplained.length) {
		buildBrandedSheet(
			wb,
			{
				name: 'Needs Recount',
				band: 'COUNT DIFFERENCES WITHOUT A RECORDED CAUSE',
				header: ['Item', 'Category', 'Expected', 'Actual', 'Difference'],
				rows: report.unexplained.map((u) => [u.itemName, u.category ?? '', u.expected, u.actual, u.difference]),
				widths: [30, 20, 12, 12, 12]
			},
			logos,
			meta
		);
	}

	await saveWorkbook(wb, `inventory-variance-${report.month}.xlsx`);
}

export async function downloadReturnedItemsExcel(report: ReturnedItemsReport, rangeLabel: string, userName: string): Promise<void> {
	const wb = await newWorkbook();
	const logos = await loadBrandLogos(wb);
	const meta = { rangeLabel, reportType: 'Returned Items', userName };
	const s = report.summary;

	buildBrandedSheet(
		wb,
		{
			name: 'Summary',
			band: 'RETURNED ITEMS — SUMMARY',
			header: ['Measure', 'Value'],
			rows: [
				['Requests returned', s.requests],
				['Units borrowed', s.borrowed],
				['Returned in good condition', s.good],
				['Damaged', s.damaged],
				['Missing', s.missing],
				['Extra units returned', s.over],
				['Requests returned on time', s.onTimeRequests],
				['Requests returned late', s.lateRequests],
				['Average days kept', s.avgDaysKept ?? '—']
			],
			widths: [34, 16]
		},
		logos,
		meta
	);

	buildBrandedSheet(
		wb,
		{
			name: 'Returned Items',
			band: 'RETURNED ITEMS — BREAKDOWN',
			header: ['Returned', 'Request', 'Student', 'Item', 'Category', 'Borrowed', 'Good', 'Damaged', 'Missing', 'Extra', 'Days kept', 'Days late', 'Inspected by', 'Reason', 'Photos'],
			rows: report.rows.map((r) => [
				fmtDate(r.returnedAt, true),
				r.requestCode,
				r.studentName,
				r.itemName,
				r.category ?? '',
				r.quantity,
				r.good,
				r.damaged,
				r.missing,
				r.over,
				r.daysKept ?? '—',
				r.daysLate,
				r.inspectedBy ?? '',
				r.remarks ?? '',
				r.photos.join('\n')
			]),
			widths: [20, 14, 24, 24, 16, 10, 8, 10, 9, 8, 10, 10, 22, 32, 40]
		},
		logos,
		meta
	);

	await saveWorkbook(wb, `returned-items-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
