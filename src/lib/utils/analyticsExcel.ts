/**
 * Client-side styled XLSX generator for the analytics reports.
 *
 * Uses the shared CHTM-branded layout from brandedExcel.ts (seals, college
 * header, meta box, pink section band and header row, zebra rows) — one
 * worksheet per selected section.
 *
 * Runs entirely in the browser (ExcelJS ships its own zip writer), so it needs
 * no server-side zip extension and produces a real .xlsx that opens in Excel.
 */
import type { AnalyticsReport } from '$lib/api/analyticsReports';
import { displayStatusKey } from '$lib/utils/statusDisplay';
import { buildBrandedSheet as buildSheet, fmtDate, loadBrandLogos, saveWorkbook } from '$lib/utils/brandedExcel';

function fmtStatus(s?: string): string {
	return s ? displayStatusKey(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
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

	const logos = await loadBrandLogos(wb);
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

	await saveWorkbook(wb, opts.fileName);
}
