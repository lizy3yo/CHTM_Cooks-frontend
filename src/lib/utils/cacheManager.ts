import { browser } from '$app/environment';
import { borrowRequestsAPI } from '$lib/api/borrowRequests';
import { donationsAPI } from '$lib/api/donations';
import { replacementObligationsAPI } from '$lib/api/replacementObligations';
import { usersAPI } from '$lib/api/users';
import { classCodesAPI } from '$lib/api/classCodes';
import { statisticsAPI } from '$lib/api/statistics';
import { notificationsAPI } from '$lib/api/notifications';
import { inventoryActivityLogsAPI } from '$lib/api/inventoryActivityLogs';
import { catalogAPI } from '$lib/api/catalog';
import { clearAnalyticsCache } from '$lib/api/analyticsReports';
import { profileApi } from '$lib/api/profile';
import { profileStore } from '$lib/stores/profile';
import { requestCartStore } from '$lib/stores/requestCart';
import { clearAllCaches as clearOfflineDBCaches } from '$lib/api/offline/offlineFirst';

/**
 * Completely clear all client-side in-memory API caches, session stores, and offline databases.
 * Must be invoked whenever a user signs out or signs in as a new user to prevent data leaking
 * from the previous user's session.
 */
export function clearAllApplicationCaches(): void {
	if (!browser) return;

	console.log('[CacheManager] Session transition: Purging all client-side caches and stores...');

	// 1. API Caches
	try { borrowRequestsAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] borrowRequestsAPI clear error', e); }
	try { donationsAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] donationsAPI clear error', e); }
	try { replacementObligationsAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] replacementObligationsAPI clear error', e); }
	try { usersAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] usersAPI clear error', e); }
	try { classCodesAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] classCodesAPI clear error', e); }
	try { statisticsAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] statisticsAPI clear error', e); }
	try { notificationsAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] notificationsAPI clear error', e); }
	try { inventoryActivityLogsAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] inventoryActivityLogsAPI clear error', e); }
	try { catalogAPI.invalidateCache(); } catch (e) { console.error('[CacheManager] catalogAPI clear error', e); }
	try { clearAnalyticsCache(); } catch (e) { console.error('[CacheManager] clearAnalyticsCache error', e); }

	// 2. Client Stores & Profile Caches
	try { profileApi.clearCache(); } catch (e) { console.error('[CacheManager] profileApi clear error', e); }
	try { profileStore.clearCache(); } catch (e) { console.error('[CacheManager] profileStore clear error', e); }
	try { requestCartStore.reset(); } catch (e) { console.error('[CacheManager] requestCartStore reset error', e); }

	// 3. Offline IndexedDB Cache
	try {
		clearOfflineDBCaches().catch((err) => {
			console.error('[CacheManager] Offline DB cache clear error:', err);
		});
	} catch (e) {
		console.error('[CacheManager] Offline cache clear error', e);
	}
}
