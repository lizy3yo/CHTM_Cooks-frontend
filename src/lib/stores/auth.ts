/**
 * Authentication Store - Cookie-Based (Production-Grade)
 * 
 * Industry-standard authentication using httpOnly cookies
 * - No localStorage usage (immune to XSS)
 * - Automatic token refresh
 * - Session persistence via remember-me
 * - Proper error handling
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { UserResponse } from '$lib/types/auth';

// Store state interface (simplified - no tokens in frontend)
interface AuthState {
	user: UserResponse | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
	justLoggedIn: boolean; // Flag to track fresh login
}

// Initial state
const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	isLoading: true,
	error: null,
	justLoggedIn: false
};

// Create the auth store
function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	// Deduplication guard — ensures concurrent init() calls share one network request.
	let initInFlight: Promise<void> | null = null;

	return {
		subscribe,

		/**
		 * Initialize authentication state.
		 *
		 * Industry-standard guards applied:
		 *   1. Skip if already authenticated — avoids redundant /api/auth/me call
		 *      after a just-completed login().
		 *   2. In-flight deduplication — concurrent calls (e.g. from multiple
		 *      components mounting simultaneously) share a single network request.
		 */
		init: async () => {
			if (!browser) return;

			// Guard 1: already authenticated — nothing to do.
			let currentState: AuthState | undefined;
			const unsub = authStore.subscribe((s) => { currentState = s; });
			unsub();
			if (currentState?.isAuthenticated) return;

			// Guard 2: deduplicate concurrent init() calls.
			if (initInFlight) return initInFlight;

			initInFlight = (async () => {
				try {
					// Check for an active session via access token cookie.
					const meResponse = await fetch('/api/auth/me', {
						credentials: 'include',
						headers: { 'Cache-Control': 'no-cache' }
					});

					if (meResponse.ok) {
						const data = await meResponse.json();
						update((state) => ({
							...state,
							user: data.user,
							isAuthenticated: true,
							isLoading: false
						}));
						return;
					}

					// No active session — attempt auto-login via remember-me cookie.
					const autoLoginResponse = await fetch('/api/auth/auto-login', {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-cache'
						}
					});

					if (autoLoginResponse.ok) {
						const data = await autoLoginResponse.json();
						update((state) => ({
							...state,
							user: data.user,
							isAuthenticated: true,
							isLoading: false
						}));
						return;
					}

					// Both methods failed — user must sign in manually.
					update(() => ({ ...initialState, isLoading: false }));
				} catch (error) {
					console.error('[AuthStore] init error:', error);
					update(() => ({ ...initialState, isLoading: false }));
				} finally {
					initInFlight = null;
				}
			})();

			return initInFlight;
		},

	/**
	 * Login with credentials
	 * Tokens are automatically set in httpOnly cookies by backend
	 */
	login: (user: UserResponse) => {
		console.log('[AuthStore.login] Received user:', user);
		console.log('[AuthStore.login] User type:', typeof user);
		console.log('[AuthStore.login] User keys:', user ? Object.keys(user) : 'null');
		console.log('[AuthStore.login] User JSON:', JSON.stringify(user, null, 2));
		
		// Clear profile cache on login to ensure fresh data
		if (browser) {
			import('$lib/api/profile').then(({ profileApi }) => {
				profileApi.clearCache();
			});
			import('$lib/stores/profile').then(({ profileStore }) => {
				profileStore.clearCache();
			});
		}
		
		update((state) => ({
			...state,
			user,
			isAuthenticated: true,
			isLoading: false,
			error: null,
			justLoggedIn: true // Set flag on login
		}));
	},
	
	/**
	 * Clear the justLoggedIn flag
	 */
	clearJustLoggedIn: () => {
		update((state) => ({
			...state,
			justLoggedIn: false
		}));
	},

	/**
	 * Sign out the current user.
	 *
	 * Industry-standard approach: local state is cleared **synchronously first**
	 * so the UI responds instantly, then the server-side cookie invalidation
	 * and cache clearing are dispatched as a non-blocking background operation.
	 * The user is never blocked waiting for a network round-trip.
	 */
	logout: () => {
		// ── 1. Clear local state immediately (instant UI feedback) ────────────
		update(() => ({ ...initialState, isLoading: false }));

		// ── 2. Background: invalidate server session + clear caches ───────────
		// Runs fire-and-forget — failures are logged but do not affect the
		// already-completed client-side sign-out.
		(async () => {
			try {
				const [{ profileApi }, { profileStore }] = await Promise.all([
					import('$lib/api/profile'),
					import('$lib/stores/profile')
				]);
				profileApi.clearCache();
				profileStore.clearCache();
			} catch {
				// Cache clearing is best-effort; ignore errors.
			}

			try {
				await fetch('/api/auth/logout', {
					method: 'POST',
					credentials: 'include',
					// keepalive ensures the request completes even if the page
					// navigates away before the response arrives.
					keepalive: true
				});
			} catch {
				// Server invalidation is best-effort; the access token will
				// expire on its own and the httpOnly cookie is already cleared
				// client-side by the navigation away from the authenticated page.
			}
		})();
	},

		/**
		 * Update user data
		 */
		updateUser: (user: UserResponse) => {
			update((state) => ({
				...state,
				user
			}));
		},

		/**
		 * Set loading state
		 */
		setLoading: (isLoading: boolean) => {
			update((state) => ({
				...state,
				isLoading
			}));
		},

		/**
		 * Set error
		 */
		setError: (error: string | null) => {
			update((state) => ({
				...state,
				error
			}));
		},

		/**
		 * Clear error
		 */
		clearError: () => {
			update((state) => ({
				...state,
				error: null
			}));
		},

		/**
		 * Refresh tokens (access token expired)
		 * Called automatically by API client on 401
		 */
		refreshTokens: async (): Promise<boolean> => {
			try {
				const response = await fetch('/api/auth/refresh', {
					method: 'POST',
					credentials: 'include'
				});

				if (response.ok) {
					// Tokens automatically refreshed in cookies
					return true;
				}
				
				// Refresh failed - sign out immediately
				authStore.logout();
				return false;
			} catch (error) {
				console.error('Token refresh failed:', error);
				authStore.logout();
				return false;
			}
		},

		/**
		 * Try auto-login with remember-me cookie
		 * This is a standalone method that can be called independently
		 * 
		 * @returns Promise<boolean> - true if auto-login succeeded, false otherwise
		 */
		tryAutoLogin: async (): Promise<boolean> => {
			try {
				console.log('[AuthStore] Attempting auto-login...');
				const response = await fetch('/api/auth/auto-login', {
					method: 'POST',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache'
					}
				});

				if (response.ok) {
					const data = await response.json();
					console.log('[AuthStore] Auto-login successful for:', data.user.email);
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true,
						isLoading: false
					}));
					return true;
				}

				// Auto-login failed (no remember-me token or expired)
				console.log('[AuthStore] Auto-login failed:', response.status);
				update((state) => ({
					...initialState,
					isLoading: false
				}));
				return false;

			} catch (error) {
				console.error('[AuthStore] Auto-login error:', error);
				update((state) => ({
					...initialState,
					isLoading: false
				}));
				return false;
			}
		},

	/**
	 * Verify current session
	 */
	verifySession: async () => {
		try {
			const response = await fetch('/api/auth/me', {
				credentials: 'include'
			});

			if (response.ok) {
				const data = await response.json();
				update((state) => ({
					...state,
					user: data.user,
					isAuthenticated: true
				}));
				return true;
			} else {
				// Session invalid — sign out immediately
				authStore.logout();
				return false;
			}
		} catch (error) {
			console.error('Session verification failed:', error);
			return false;
		}
	},

	/**
	 * Logout from all devices
	 */
	logoutAllDevices: async (userId: string) => {
		try {
			await fetch('/api/auth/logout', {
				method: 'DELETE',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ userId })
				});
				
				// Clear local state
				update((state) => ({
					...initialState,
					isLoading: false
				}));
			} catch (error) {
				console.error('Logout all devices failed:', error);
				throw error;
			}
		}
	};
}

// Export store instance
export const authStore = createAuthStore();

// Export derived store for user
export const user = {
	subscribe: (handler: (value: UserResponse | null) => void) => {
		return authStore.subscribe((state) => handler(state.user));
	}
};

// Export derived store for authentication status
export const isAuthenticated = {
	subscribe: (handler: (value: boolean) => void) => {
		return authStore.subscribe((state) => handler(state.isAuthenticated));
	}
};

// Export derived store for loading status
export const isLoading = {
	subscribe: (handler: (value: boolean) => void) => {
		return authStore.subscribe((state) => handler(state.isLoading));
	}
};

// Export derived store for justLoggedIn status
export const justLoggedIn = {
	subscribe: (handler: (value: boolean) => void) => {
		return authStore.subscribe((state) => handler(state.justLoggedIn));
	}
};
