import { getApiErrorMessage } from './session';

/**
 * Bulk imports from a spreadsheet.
 *
 * The browser parses the file and posts the rows as JSON. The server checks
 * every row before writing anything and saves them together, so an import
 * either lands whole or changes nothing. Rows it rejects come back with the
 * spreadsheet row number they sit on.
 */

export interface ImportRowIssue {
	/** Spreadsheet row number; row 1 is the header. */
	row: number;
	message: string;
}

/** Thrown when the server refuses an import because of specific rows. */
export class ImportRowsError extends Error {
	rowErrors: ImportRowIssue[];

	constructor(message: string, rowErrors: ImportRowIssue[]) {
		super(message);
		this.name = 'ImportRowsError';
		this.rowErrors = rowErrors;
	}
}

async function postImport<T>(url: string, body: unknown): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const payload = (await res.json().catch(() => ({}))) as T & { error?: string; rowErrors?: ImportRowIssue[] };

	if (!res.ok) {
		const message = await getApiErrorMessage(res, payload.error ?? `Import failed: ${res.status}`);
		if (payload.rowErrors?.length) throw new ImportRowsError(message, payload.rowErrors);
		throw new Error(message);
	}
	return payload;
}

export interface DonationImportRow {
	donorName: string;
	itemName: string;
	quantity: number;
	unitCost?: number;
	date?: string;
	purpose?: string;
	notes?: string;
	category?: string;
	unit?: string;
}

export interface UserImportRow {
	firstName: string;
	lastName: string;
	email: string;
	yearLevel?: string;
	block?: string;
	/** Enrols a student into this class; both are needed to identify it. */
	courseCode?: string;
	section?: string;
}

export interface ClassCodeImportRow {
	courseCode: string;
	courseName: string;
	section: string;
	academicYear: string;
	semester: string;
	maxEnrollment?: number;
	instructorEmail?: string;
}

export const importsAPI = {
	donations(rows: DonationImportRow[]) {
		return postImport<{ imported: number; newItems: number; units: number; totalValue: number }>('/api/donations/import', { rows });
	},

	users(role: 'student' | 'instructor', rows: UserImportRow[], temporaryPassword: string) {
		return postImport<{ imported: number; enrolled: number }>('/api/users/import', { role, rows, temporaryPassword });
	},

	classCodes(rows: ClassCodeImportRow[]) {
		return postImport<{ created: number; updated: number; instructorsAssigned: number }>('/api/class-codes/import', { rows });
	}
};
