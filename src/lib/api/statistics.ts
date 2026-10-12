/**
 * Client-side Statistics API module
 *
 * Provides a typed wrapper around GET /api/student-statistics with a
 * 12-hour in-memory cache to prevent redundant network round-trips
 * during the same browsing session (mirrors the pattern used in
 * borrowRequests.ts and replacementObligations.ts).
 *
 * Cache layers:
 *  1. Client memory cache (this module) — 43200 s TTL, instant reads
 *  2. Server Redis cache (/api/student-statistics) — 43200 s TTL
 *  3. MongoDB aggregation (computeStudentStatistics service) — source of truth
 */

import { getApiErrorMessage } from './session';
import { QueryCache } from './queryCache';

// ─── Re-export shared types so consumers import from one place ─────────────────

export type TrustTier = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
export type StatisticsPeriod = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';

export interface TrustScoreBreakdown {
	missingItemPenalty: number;
	damagedItemPenalty: number;
	lateReturnPenalty: number;
	cancelledAfterApprovalPenalty: number;
	pendingObligationPenalty: number;
	cleanReturnBonus: number;
	resolvedObligationBonus: number;
}

export interface TrustScore {
	score: number;
	tier: TrustTier;
	tierLabel: string;
	breakdown: TrustScoreBreakdown;
	totalPenalties: number;
	totalBonuses: number;
}

export interface RequestStatistics {
	total: number;
	pending: number;
	active: number;
	returned: number;
	cancelled: number;
	rejected: number;
	missing: number;
}

export interface ReturnPerformance {
	totalReturned: number;
	onTime: number;
	late: number;
	unknown: number;
	onTimeRate: number | null;
	avgDaysLate: number;
	maxDaysLate: number;
}

export interface ItemHealthStats {
	totalInspected: number;
	goodCondition: number;
	damaged: number;
	missing: number;
	goodRate: number | null;
}

export interface ReplacementStats {
	totalObligations: number;
	pendingCount: number;
	resolvedCount: number;
	totalAmount: number; // Total items affected
	amountPaid: number; // Items already replaced
	balance: number; // Items still pending replacement
	periodIncurredAmount: number; // Items affected in period
}

export interface DataQuality {
	inspectionCoverage: number;
	returnTimestampCoverage: number;
	inspectedReturnCount: number;
	returnedCount: number;
}

export interface ActivityMonth {
	month: string;
	label: string;
	requests: number;
	returned: number;
}

export type ChartGranularity = 'day' | 'month';

export interface CategoryStat {
	category: string;
	count: number;
	percentage: number;
}

export interface StudentInsight {
	id: string;
	severity: 'success' | 'info' | 'warning' | 'critical';
	title: string;
	description: string;
	actionLabel?: string;
	href?: string;
}

export interface StudentStatisticsData {
	period: StatisticsPeriod;
	periodLabel: string;
	chartGranularity: ChartGranularity;
	trustScore: TrustScore;
	requests: RequestStatistics;
	returnPerformance: ReturnPerformance;
	itemHealth: ItemHealthStats;
	replacement: ReplacementStats;
	dataQuality: DataQuality;
	activityTimeline: ActivityMonth[];
	topCategories: CategoryStat[];
	insights: StudentInsight[];
	computedAt: string;
}

// ─── Internal cache primitives ─────────────────────────────────────────────────

// A student's figures move with their own requests and replacement cases; the
// realtime hub marks them stale on either, and they revalidate on next use.
const cacheByPeriod = new QueryCache<StudentStatisticsData>({
	topics: ['borrow_request_change', 'replacement_obligation_change']
});

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

async function doFetch(period: StatisticsPeriod, forceRefresh: boolean): Promise<StudentStatisticsData> {
	const url = forceRefresh
		? `/api/student-statistics?period=${period}&_t=${Date.now()}`
		: `/api/student-statistics?period=${period}`;

	const response = await fetch(url, {
		method: 'GET',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	});

	const payload = (await response.json().catch(() => ({}))) as StudentStatisticsData & ApiError;

	if (!response.ok) {
		const message = await getApiErrorMessage(
			response,
			payload.message ?? payload.error ?? `Request failed with status ${response.status}`
		);
		throw new Error(message);
	}

	return payload;
}

// ─── Public API ────────────────────────────────────────────────────────────────

interface FetchOptions {
	forceRefresh?: boolean;
	period?: StatisticsPeriod;
}

export const statisticsAPI = {
	/**
	 * Fetch the student statistics snapshot.
	 *
	 * - Returns the in-memory cache immediately if it is still fresh.
	 * - Deduplicates concurrent calls: if a fetch is already in-flight the
	 *   same promise is returned to all callers.
	 * - Pass `forceRefresh: true` to bypass both client and server caches
	 *   (appends `?_t=…` which the server interprets as a cache-bust flag).
	 */
	async get(options: FetchOptions = {}): Promise<StudentStatisticsData> {
		const period = options.period ?? '180d';

		return cacheByPeriod.fetch(period, () => doFetch(period, options.forceRefresh ?? false), {
			force: options.forceRefresh
		});
	},

	/**
	 * Synchronously read the current cache without triggering a fetch.
	 * Returns `null` if the cache is empty or stale.
	 */
	peek(period: StatisticsPeriod = '180d'): StudentStatisticsData | null {
		return cacheByPeriod.peek(period);
	},

	/**
	 * Evict the in-memory cache so the next `get()` call goes to the network.
	 */
	invalidateCache(period?: StatisticsPeriod): void {
		cacheByPeriod.markStale(period);
	}
};

