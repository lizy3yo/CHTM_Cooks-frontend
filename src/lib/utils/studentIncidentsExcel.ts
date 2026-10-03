import type { StudentIncident, StudentIncidentReport, StudentIncidentSummary } from '$lib/api/studentIncidents';
import { buildBrandedSheet, fmtDate, loadBrandLogos, saveWorkbook } from '$lib/utils/brandedExcel';

/**
 * Damage & Missing History as a branded workbook: one summary sheet of
 * students, one sheet of past-due replacements, and — when given — the full
 * incident list of a single student.
 */

const TYPE = { damaged: 'Damaged', missing: 'Missing' } as const;
const STATUS = { pending: 'Pending replacement', replaced: 'Replaced', recorded: 'Recorded (walk-in)' } as const;

interface Options {
	report: StudentIncidentReport;
	rangeLabel: string;
	userName: string;
	/** Optional: also export one student's full history. */
	student?: { summary: StudentIncidentSummary; incidents: StudentIncident[] };
}

export async function downloadStudentIncidentsExcel(opts: Options): Promise<void> {
	// Interop: some bundlers expose the namespace, others the default export.
	const mod: any = await import('exceljs');
	const ExcelJS = mod.default ?? mod;
	const wb = new ExcelJS.Workbook();
	wb.creator = 'CHTM-Cooks System';
	wb.created = new Date();

	const logos = await loadBrandLogos(wb);
	const meta = { rangeLabel: opts.rangeLabel, reportType: 'Damage & Missing History', userName: opts.userName };

	if (opts.student) {
		const s = opts.student.summary;
		buildBrandedSheet(
			wb,
			{
				name: 'Student History',
				band: `DAMAGE & MISSING HISTORY — ${s.studentName.toUpperCase()}`,
				header: ['Date', 'Item', 'Type', 'Qty', 'Source', 'Reference', 'Status', 'Still owed', 'Due', 'Resolved', 'Notes'],
				rows: opts.student.incidents.map((i) => [
					fmtDate(i.incidentAt, true),
					i.itemName,
					TYPE[i.type],
					i.quantity,
					i.source === 'walk_in' ? 'Walk-in' : 'Borrow request',
					i.reference,
					STATUS[i.status],
					i.outstanding ?? '—',
					fmtDate(i.dueDate),
					fmtDate(i.resolvedAt),
					i.notes ?? ''
				]),
				widths: [20, 24, 11, 7, 15, 16, 20, 11, 14, 14, 30]
			},
			logos,
			meta
		);
	}

	buildBrandedSheet(
		wb,
		{
			name: 'Students',
			band: `DAMAGE & MISSING BY STUDENT — ${opts.rangeLabel.toUpperCase()}`,
			header: ['Student', 'Email', 'Incidents', 'Damaged', 'Missing', 'Units', 'Pending', 'Still owed', 'Walk-in', 'Last incident'],
			rows: opts.report.students.map((s) => [
				s.studentName,
				s.email ?? '',
				s.total,
				s.damaged,
				s.missing,
				s.unitsAffected,
				s.pending,
				s.outstandingUnits,
				s.walkIn,
				fmtDate(s.lastIncidentAt)
			]),
			widths: [24, 28, 11, 10, 10, 8, 10, 11, 9, 16]
		},
		logos,
		meta
	);

	const aging = opts.report.replacementAging;
	buildBrandedSheet(
		wb,
		{
			name: 'Unpaid Replacements',
			band: `UNPAID REPLACEMENTS — ${aging.open} OPEN, ${aging.pastDue} PAST DUE`,
			header: ['Student', 'Item', 'Type', 'Still owed', 'Due', 'Days past due', 'Reference'],
			rows: aging.pastDueItems.map((p) => [
				p.studentName,
				p.itemName,
				TYPE[p.type],
				p.outstanding,
				fmtDate(p.dueDate),
				p.daysPastDue,
				p.reference
			]),
			widths: [24, 24, 11, 11, 14, 14, 16]
		},
		logos,
		meta
	);

	const stamp = new Date().toISOString().slice(0, 10);
	const who = opts.student ? `-${opts.student.summary.studentName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : '';
	await saveWorkbook(wb, `damage-missing-history${who}-${stamp}.xlsx`);
}
