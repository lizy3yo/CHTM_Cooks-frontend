/**
 * Borrow request statuses whose on-screen name differs from their stored key.
 * `pending_instructor` is shown as "Under Review" on every page.
 */
const DISPLAY_KEYS: Record<string, string> = {
	pending_instructor: 'under_review'
};

/**
 * Stored status → the key to format for display. Screens keep their own
 * formatting (Title Case, UPPERCASE, etc.); only the renamed status changes.
 */
export function displayStatusKey(status: string): string {
	return DISPLAY_KEYS[status] ?? status;
}

/**
 * Canonical staff-facing name for each borrow request status. Staff screens
 * (admin, custodian, superadmin) use these so a status has one name everywhere.
 */
export const STATUS_LABELS: Record<string, string> = {
	pending_instructor: 'Under Review',
	pending_appeal: 'Appeal Under Review',
	approved_instructor: 'Awaiting Preparation',
	ready_for_pickup: 'Ready for Pickup',
	borrowed: 'Currently Borrowed',
	pending_return: 'Awaiting Return Confirmation',
	missing: 'Unresolved',
	resolved: 'Resolved',
	returned: 'Completed',
	cancelled: 'Cancelled',
	rejected: 'Declined',
	expired: 'Expired'
};

export function statusLabel(status: string): string {
	return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
