import { getApiErrorMessage } from './session';

/**
 * Damage & Missing History — `GET /api/reports/student-incidents`.
 *
 * All-time unless a range is given. Instructors only receive students enrolled
 * in their own classes; the server enforces that.
 */

export type IncidentType = 'damaged' | 'missing';
/** pending/replaced for borrow requests; walk-ins are only "recorded". */
export type IncidentStatus = 'pending' | 'replaced' | 'recorded';

export interface StudentIncidentSummary {
	studentId: string;
	studentName: string;
	email: string | null;
	profilePhotoUrl: string | null;
	yearLevel: string | null;
	block: string | null;
	total: number;
	damaged: number;
	missing: number;
	unitsAffected: number;
	/** Borrow-request replacements still owed. */
	pending: number;
	outstandingUnits: number;
	walkIn: number;
	lastIncidentAt: string | null;
}

export interface StudentIncident {
	id: string;
	source: 'request' | 'walk_in';
	reference: string;
	requestId: string | null;
	studentId: string;
	type: IncidentType;
	itemName: string;
	category: string | null;
	quantity: number;
	/** null for walk-ins, which have no replacement tracking. */
	outstanding: number | null;
	status: IncidentStatus;
	incidentAt: string | null;
	dueDate: string | null;
	resolvedAt: string | null;
	notes: string | null;
}

export interface PastDueReplacement {
	id: string;
	studentId: string;
	studentName: string;
	itemName: string;
	type: IncidentType;
	outstanding: number;
	dueDate: string;
	daysPastDue: number;
	reference: string;
}

export interface ReplacementAging {
	open: number;
	within7Days: number;
	within30Days: number;
	over30Days: number;
	pastDue: number;
	pastDueItems: PastDueReplacement[];
}

export interface StudentIncidentReport {
	range: { from: string | null; to: string | null };
	totals: { students: number; incidents: number; damaged: number; missing: number; pending: number; walkIn: number };
	students: StudentIncidentSummary[];
	replacementAging: ReplacementAging;
	generatedAt: string;
}

export interface StudentIncidentDetail {
	student: StudentIncidentSummary;
	incidents: StudentIncident[];
	range: { from: string | null; to: string | null };
}

export interface IncidentQuery {
	/** yyyy-mm-dd; omit both for all time. */
	from?: string;
	to?: string;
	classCodeIds?: string[];
}

function toParams(q: IncidentQuery): string {
	const p = new URLSearchParams();
	if (q.from) p.set('from', q.from);
	if (q.to) p.set('to', q.to);
	if (q.classCodeIds?.length) p.set('class_code_id', q.classCodeIds.join(','));
	const s = p.toString();
	return s ? `?${s}` : '';
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
	const body = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) {
		throw new Error(await getApiErrorMessage(res, body.error ?? `Request failed: ${res.status}`));
	}
	return body;
}

export const studentIncidentsAPI = {
	list(query: IncidentQuery = {}): Promise<StudentIncidentReport> {
		return getJson(`/api/reports/student-incidents${toParams(query)}`);
	},

	detail(studentId: string, query: IncidentQuery = {}): Promise<StudentIncidentDetail> {
		return getJson(`/api/reports/student-incidents/${encodeURIComponent(studentId)}${toParams(query)}`);
	}
};
