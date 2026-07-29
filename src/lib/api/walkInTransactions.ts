/**
 * Walk-in (Alternative) Transactions API Client
 *
 * Desk walk-in checkouts recorded by custodians. Persisted server-side so the
 * records are visible to every staff role (custodian, instructor, admin,
 * superadmin) instead of living only in the recording browser.
 */

import { getApiErrorMessage } from './session';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WalkInTransactionItem {
	itemId: string;
	name: string;
	quantity: number;
	category: string;
	inspectionStatus?: 'good' | 'damaged' | 'missing' | null;
}

export interface WalkInTransactionRecord {
	/** Human reference (e.g. "W-AB12CD") — also used as the key for actions. */
	id: string;
	dbId: string;
	studentName: string;
	studentId: string;
	email: string;
	classCode: string;
	purpose: string;
	usageLocation: 'school' | 'outdoor';
	borrowDate: string;
	returnDate: string;
	items: WalkInTransactionItem[];
	status: 'borrowed' | 'returned' | 'missing';
	returnedAt?: string | null;
	notes?: string | null;
	createdAt: string;
}

export interface CreateWalkInInput {
	studentName: string;
	/** Displayed identifier (real user id string or a guest ID). */
	studentId?: string;
	/** Real user id, when the borrower is a registered student. */
	studentUserId?: string | number | null;
	email?: string;
	classCode?: string;
	purpose?: string;
	usageLocation?: 'school' | 'outdoor';
	borrowDate?: string;
	returnDate: string;
	items: { itemId?: string; name: string; quantity: number; category?: string }[];
}

export interface ReturnWalkInInput {
	status?: 'returned' | 'missing';
	notes?: string;
	items?: { itemId?: string; inspectionStatus?: 'good' | 'damaged' | 'missing' }[];
}

export interface WalkInsListResponse {
	walkIns: WalkInTransactionRecord[];
	total: number;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) options.body = JSON.stringify(body);
	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message = await getApiErrorMessage(
			response,
			payload.message || payload.error || `Request failed: ${response.status}`
		);
		throw new Error(message);
	}
	return payload;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const walkInTransactionsAPI = {
	/** List walk-in transactions (most recent first). */
	async list(
		params: { status?: string; search?: string; limit?: number } = {}
	): Promise<WalkInsListResponse> {
		const searchParams = new URLSearchParams();
		if (params.status) searchParams.set('status', params.status);
		if (params.search) searchParams.set('search', params.search);
		if (params.limit) searchParams.set('limit', String(params.limit));
		const query = searchParams.toString();
		const res = await fetch(
			`/api/walk-in-transactions${query ? `?${query}` : ''}`,
			getFetchOptions('GET')
		);
		return handleResponse<WalkInsListResponse>(res);
	},

	/** Record a new walk-in checkout. */
	async create(payload: CreateWalkInInput): Promise<WalkInTransactionRecord> {
		const res = await fetch('/api/walk-in-transactions', getFetchOptions('POST', payload));
		return handleResponse<WalkInTransactionRecord>(res);
	},

	/** Process a return / inspection for a walk-in transaction (by reference). */
	async markReturned(
		reference: string,
		payload: ReturnWalkInInput
	): Promise<WalkInTransactionRecord> {
		const res = await fetch(
			`/api/walk-in-transactions/${encodeURIComponent(reference)}/return`,
			getFetchOptions('POST', payload)
		);
		return handleResponse<WalkInTransactionRecord>(res);
	}
};
