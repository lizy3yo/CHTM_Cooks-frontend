import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const DASHBOARD_ROUTES: Record<string, string> = {
	student: '/student/dashboard',
	instructor: '/instructor/dashboard',
	custodian: '/custodian/dashboard',
	superadmin: '/superadmin/dashboard',
	admin: '/admin/dashboard'
};

/**
 * Send signed-in visitors straight to their dashboard before the landing page
 * is rendered. The session is already resolved by the auth hook, so anonymous
 * visitors pay no extra cost here.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.user?.role;
	if (role && DASHBOARD_ROUTES[role]) {
		redirect(303, DASHBOARD_ROUTES[role]);
	}

	return {};
};
