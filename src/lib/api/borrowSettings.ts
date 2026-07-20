import { getApiErrorMessage } from './session';

export interface BorrowSettingsResponse {
	id: string;
	maxStandardDays: number;
	maxAdvanceDays: number;
	allowExtendedBorrowing: boolean;
	maxExtendedDays: number;
	requireExtendedJustification: boolean;
	requireExtendedApproval: boolean;
	maxExtendedItemsPerStudent: number;
	allowedExtendedReasons: string[];
	updatedAt: string | null;
}

export interface UpdateBorrowSettingsRequest {
	maxStandardDays: number;
	maxAdvanceDays: number;
	allowExtendedBorrowing: boolean;
	maxExtendedDays: number;
	requireExtendedJustification: boolean;
	requireExtendedApproval: boolean;
	maxExtendedItemsPerStudent: number;
	allowedExtendedReasons: string[];
}

/**
 * Fetch system borrowing policy settings
 */
export async function getBorrowSettings(): Promise<BorrowSettingsResponse> {
	const res = await fetch('/api/borrow-settings', {
		credentials: 'include'
	});

	if (!res.ok) {
		const message = await getApiErrorMessage(res, 'Failed to fetch borrowing policy settings');
		throw new Error(message);
	}

	return await res.json();
}

/**
 * Update system borrowing policy settings (Admin / Superadmin / Custodian)
 */
export async function updateBorrowSettings(
	payload: UpdateBorrowSettingsRequest
): Promise<BorrowSettingsResponse> {
	const res = await fetch('/api/borrow-settings', {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!res.ok) {
		const message = await getApiErrorMessage(res, 'Failed to update borrowing policy settings');
		throw new Error(message);
	}

	const data = await res.json();
	return data.settings ?? data;
}
