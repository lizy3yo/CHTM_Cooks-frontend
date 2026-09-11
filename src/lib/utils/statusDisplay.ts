/**
 * Borrow request statuses whose on-screen name differs from their stored key.
 * `pending_instructor` is shown as "Pending Approval" on every page.
 */
const DISPLAY_KEYS: Record<string, string> = {
	pending_instructor: 'pending_approval'
};

/**
 * Stored status → the key to format for display. Screens keep their own
 * formatting (Title Case, UPPERCASE, etc.); only the renamed status changes.
 */
export function displayStatusKey(status: string): string {
	return DISPLAY_KEYS[status] ?? status;
}
