/**
 * Onboarding Store
 *
 * Tracks whether a user has completed the first-run guided tour, and exposes a
 * lightweight signal to (re)launch the tour on demand (e.g. from the Help page).
 *
 * Persistence is device-level via localStorage — this is a non-sensitive "has
 * seen the tour" flag, so it deliberately does NOT touch the httpOnly-cookie
 * auth session. The flag is namespaced by a schema version, the user's role,
 * and the user id so that:
 *   - each user on a shared device gets their own first-run experience, and
 *   - bumping ONBOARDING_VERSION re-introduces the tour to everyone after a
 *     significant UI change.
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Bump when the tour content changes enough to warrant showing it again.
 * v2 — the tour is now presented page by page, so everyone sees it once more.
 * v3 — admin tour added; instructor & custodian tours expanded to full
 *      page-by-page walkthroughs, so those roles see the updated tour once more.
 */
export const ONBOARDING_VERSION = 3;

export type OnboardingRole = 'student' | 'instructor' | 'custodian' | 'admin';

function storageKey(role: OnboardingRole, userId: string): string {
	return `chtm.onboarding.v${ONBOARDING_VERSION}.${role}.${userId}`;
}

/**
 * True once the given user has completed or skipped the tour.
 *
 * The account-level value (`onboardingCompletedAt`, returned by the auth
 * endpoints) is the source of truth: it follows the user across devices and is
 * empty for every newly created or imported account, so those users always get
 * the tour on their first login. The device flag is only a fallback for when
 * that value isn't available (older session payload, offline).
 */
export function hasCompletedOnboarding(
	role: OnboardingRole,
	userId: string,
	serverCompletedAt?: string | null
): boolean {
	if (!browser || !userId) return true; // fail safe: never nag when we can't tell
	if (serverCompletedAt !== undefined) return serverCompletedAt !== null;
	try {
		return localStorage.getItem(storageKey(role, userId)) === '1';
	} catch {
		// localStorage can throw in private-mode / storage-disabled browsers.
		return true;
	}
}

/**
 * Persist that the user has finished (or skipped) the tour — on their account
 * (so it sticks on every device) and on this device (so the current session
 * settles immediately even if the request is slow or fails).
 */
export function markOnboardingComplete(role: OnboardingRole, userId: string): void {
	if (!browser || !userId) return;
	try {
		localStorage.setItem(storageKey(role, userId), '1');
	} catch {
		// Best-effort; if storage is unavailable the tour simply shows again.
	}
	void fetch('/api/auth/onboarding/complete', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	}).catch(() => {
		// Offline / transient failure: the device flag still suppresses the tour
		// here, and the next completion attempt will sync the account.
	});
}

/**
 * Clear the flag so the tour behaves as it does for a brand-new user (auto-starts
 * on the next dashboard visit). Also emits a re-arm signal so the mounted
 * controller drops its once-per-session guard immediately — otherwise the reset
 * wouldn't take effect until a full page reload.
 */
export function resetOnboarding(role: OnboardingRole, userId: string): void {
	if (!browser || !userId) return;
	try {
		localStorage.removeItem(storageKey(role, userId));
	} catch {
		/* ignore */
	}
	// Clear it on the account too, so the reset holds on every device.
	void fetch('/api/auth/onboarding/complete', {
		method: 'DELETE',
		credentials: 'include'
	}).catch(() => {
		/* device flag is already cleared; account sync is best-effort */
	});
	resetNonce += 1;
	tourReset.set({ role, nonce: resetNonce });
}

/**
 * Practice ("sandbox") mode.
 *
 * True while a guided tour is active. Pages that would otherwise persist data
 * (e.g. submitting a borrow request) check this and skip the real write, so the
 * user can fill things in and experience the flow without anything being saved.
 */
export const practiceMode = writable(false);

/**
 * Manual re-launch signal.
 *
 * The Help page calls `requestTour(role)`; the mounted OnboardingController for
 * that role observes the change (a monotonically increasing nonce guarantees
 * repeat requests are detected) and re-opens the tour.
 */
export const tourRequest = writable<{ role: OnboardingRole; nonce: number } | null>(null);

let nonce = 0;
export function requestTour(role: OnboardingRole): void {
	nonce += 1;
	tourRequest.set({ role, nonce });
}

/**
 * Re-arm signal, emitted by resetOnboarding(). The controller drops its
 * once-per-session auto-start guard so the tour can auto-appear again on the
 * next visit to that role's dashboard.
 */
export const tourReset = writable<{ role: OnboardingRole; nonce: number } | null>(null);
let resetNonce = 0;
