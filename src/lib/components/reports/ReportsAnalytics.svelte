<script lang="ts">
	/**
	 * Reports & Analytics, shared by every role that has it (admin, custodian,
	 * superadmin, instructor). The route pages only pass their wording and the
	 * onboarding-tour anchor prefix; behaviour is identical everywhere.
	 */
	import { displayStatusKey } from '$lib/utils/statusDisplay';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import {
		fetchAnalytics,
		fetchAnalyticsSummary,
		peekCachedAnalytics,
		subscribeToAnalyticsChanges,
		type AnalyticsReport,
		type AnalyticsPeriod
	} from '$lib/api/analyticsReports';
	import { classCodesAPI, type ClassCodeResponse } from '$lib/api/classCodes';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import AnalyticsExportModal, {
		type AnalyticsExportConfig,
		type ExportSection
	} from '$lib/components/reports/AnalyticsExportModal.svelte';
	import { toastStore } from '$lib/stores/toast';
	import { downloadAnalyticsExcel } from '$lib/utils/analyticsExcel';
	import { user } from '$lib/stores/auth';
	import ReportsSkeletonLoader from '$lib/components/ui/ReportsSkeletonLoader.svelte';
	import {
		TrendingUp,
		AlertTriangle,
		Users,
		Package,
		BarChart3,
		Download,
		FileText,
		Search,
		X
	} from 'lucide-svelte';

	import ProcessedTransactionsTab from '$lib/components/reports/ProcessedTransactionsTab.svelte';
	import StockAdjustmentsTable from '$lib/components/reports/StockAdjustmentsTable.svelte';
	import DonorContributionsTable from '$lib/components/reports/DonorContributionsTable.svelte';
	import BorrowingDetailModal from '$lib/components/reports/BorrowingDetailModal.svelte';
	import StudentRiskDetailModal from '$lib/components/reports/StudentRiskDetailModal.svelte';
	import StockAdjustmentDetailModal from '$lib/components/reports/StockAdjustmentDetailModal.svelte';
	import ReportDetailModal from '$lib/components/reports/ReportDetailModal.svelte';
	import { opensDetail, statusBadge, DETAIL_HOVER, type ReportDetail } from '$lib/components/reports/reportDetail.svelte';
	import { borrowedItemDetail, overdueDetail, requestsDetail, studentsDetail } from '$lib/components/reports/reportDetailBuilders';
	import WalkInTransactionsTab from '$lib/components/reports/WalkInTransactionsTab.svelte';
	import StudentIncidentHistory from '$lib/components/reports/StudentIncidentHistory.svelte';
	import InventoryVarianceReport from '$lib/components/reports/InventoryVarianceReport.svelte';
	import ReturnedItemsReport from '$lib/components/reports/ReturnedItemsReport.svelte';

	interface Props {
		title?: string;
		subtitle?: string;
		/** Browser tab title; omitted when the route sets its own. */
		documentTitle?: string | null;
		/** Onboarding-tour anchor prefix, e.g. `admin-analytics` → `admin-analytics-header`. */
		tourId?: string | null;
	}

	let {
		title = 'Reports & Analytics',
		subtitle = 'Professional borrowing and inventory analytics',
		documentTitle = null,
		tourId = null
	}: Props = $props();

	function tour(part: string): string | undefined {
		return tourId ? `${tourId}-${part}` : undefined;
	}

	type Tab = 'overview' | 'borrowing' | 'inventory' | 'returns' | 'students' | 'processed' | 'walk-in';
	type DatePreset = 'today' | 'last7' | 'mtd' | 'month' | 'custom';

	const initialTo = todayISO();
	const initialFrom = monthStartISO();
	const initialReport = browser
		? peekCachedAnalytics({ period: 'month', from: initialFrom, to: initialTo })
		: null;

	// Raw, not deep-reactive: the report is only ever replaced whole, and deep
	// proxies made every read of its (large) lists ~100x slower, e.g. when a
	// detail modal scans itemEntries on open.
	let report = $state.raw<AnalyticsReport | null>(initialReport);
	let borrowDetail = $state.raw<{ kind: 'entry' | 'item' | 'borrower'; subject: any } | null>(null);
	let adjDetail = $state.raw<any | null>(null);
	let studentDetail = $state.raw<any | null>(null);
	let summaryReport = $state.raw<Partial<AnalyticsReport> | null>(null);
	// Walk-in transactions come from the shared analytics payload (all staff roles see them).
	const walkInSource = $derived(report?.walkIns ?? summaryReport?.walkIns ?? null);
	let loading = $state(!initialReport);
	let overviewLoading = $state(!initialReport);
	let borrowingLoading = $state(!initialReport);
	let inventoryLoading = $state(!initialReport);
	let studentRiskLoading = $state(!initialReport);
	let error = $state<string | null>(null);
	let unsubscribeSSE: (() => void) | null = null;
	let hasMounted = false;
	let pendingLoadTimer: ReturnType<typeof setTimeout> | null = null;

	let activeTab = $state<Tab>('overview');

	// Tab row: which sides have tabs scrolled out of view (drives the edge fades).
	let tabsNav = $state<HTMLElement | null>(null);
	let tabsOverflow = $state({ left: false, right: false });

	function updateTabOverflow(): void {
		if (!tabsNav) return;
		const { scrollLeft, scrollWidth, clientWidth } = tabsNav;
		tabsOverflow = {
			left: scrollLeft > 1,
			right: scrollLeft + clientWidth < scrollWidth - 1
		};
	}

	$effect(() => {
		if (!tabsNav) return;
		updateTabOverflow();
		const observer = new ResizeObserver(updateTabOverflow);
		observer.observe(tabsNav);
		return () => observer.disconnect();
	});
	let period = $state<AnalyticsPeriod>('month');
	let datePreset = $state<DatePreset>('mtd');
	let customFrom = $state(initialFrom);
	let customTo = $state(initialTo);
	/** The calendar month shown by the "By Month" preset, as yyyy-mm. */
	let selectedMonth = $state(initialTo.slice(0, 7));
	let borrowedItemsQuery = $state('');
	/** Borrowed Items list: every request line, or one row per item with totals. */
	let borrowedView = $state<'entry' | 'item'>('entry');
	let borrowersQuery = $state('');
	let inventoryItemsQuery = $state('');
	let inventoryVarianceFilter = $state<'all' | 'over' | 'under'>('all');
	let relatedRequestsQuery = $state('');
	let studentTrustQuery = $state('');
	let borrowedItemsPage = $state(1);
	let borrowersPage = $state(1);
	let varianceItemsPage = $state(1);
	let relatedRequestsPage = $state(1);
	let studentTrustPage = $state(1);
	const INVENTORY_PAGE_SIZE = 10;

	// Dropdown filter options
	let classCodes = $state<ClassCodeResponse[]>([]);
	let instructors = $state<UserResponse[]>([]);
	let students = $state<UserResponse[]>([]);
	let custodians = $state<UserResponse[]>([]);

	// Selections
	let selectedClassCodeId = $state<string>('');
	let selectedInstructorId = $state<string>('');
	let selectedStudentId = $state<string>('');
	let selectedCustodianId = $state<string>('');

	// Export scope — defaults to the page filters when the modal opens, but can
	// be changed to a single class / student (or "All") just for the export.
	let exportClassCodeId = $state<string>('');
	let exportStudentId = $state<string>('');
	let exportInstructorId = $state<string>('');
	let exportCustodianId = $state<string>('');

	function openExportModal() {
		exportClassCodeId = selectedClassCodeId;
		exportStudentId = selectedStudentId;
		exportInstructorId = selectedInstructorId;
		exportCustodianId = selectedCustodianId;
		showExportModal = true;
	}

	const numberFmt = new Intl.NumberFormat();

	// ── Details behind the figures ──────────────────────────────────────────
	/** Every request line in the period; the full report carries it. */
	const detailEntries = $derived(report?.borrowRequests?.itemEntries ?? []);

	/** Items whose count is above or below the month's starting count. */
	function varianceItemsDetail(over: boolean): ReportDetail {
		const items = (report?.inventory?.eomVariance ?? []).filter((i) => (over ? i.variance > 0 : i.variance < 0));
		return {
			title: over ? 'Items over the starting count' : 'Items under the starting count',
			subtitle: 'Current count against the month\'s starting count',
			stat: {
				label: over ? 'Units over' : 'Units under',
				value: numberFmt.format(Math.abs(items.reduce((sum, i) => sum + i.variance, 0))),
				tone: over ? 'good' : 'bad'
			},
			sections: [
				{
					title: 'Items',
					empty: report ? 'No items in this group.' : 'The item list is still loading. Try again in a moment.',
					rows: items.map((i) => ({
						picture: i.picture ?? null,
						title: i.name,
						subtitle: i.category || 'Uncategorized',
						meta: `Now ${i.quantity} · started at ${i.eomCount}`,
						right: `${i.variance > 0 ? '+' : ''}${i.variance}`
					}))
				}
			]
		};
	}

	function inventoryCountDetail(label: string): ReportDetail {
		return {
			title: label === 'Current' ? 'Current stock' : 'Starting count',
			subtitle: 'Inventory compare',
			stat: {
				label: label === 'Current' ? 'Units on record now' : 'Units at the start of the month',
				value: numberFmt.format(label === 'Current' ? inventorySummary.currentCount : inventorySummary.eomCount)
			},
			fields: [
				{ label: 'Current count', value: numberFmt.format(inventorySummary.currentCount) },
				{ label: 'Starting count', value: numberFmt.format(inventorySummary.eomCount) },
				{ label: 'Donated units', value: numberFmt.format(inventorySummary.donations ?? 0) },
				{ label: 'Required items', value: numberFmt.format(inventorySummary.requiredCount ?? 0) },
				{ label: 'Low on stock', value: numberFmt.format(inventorySummary.lowStockCount ?? 0) },
				{ label: 'Out of stock', value: numberFmt.format(inventorySummary.outOfStockCount ?? 0) },
				{ label: 'Units added by adjustment', value: numberFmt.format(inventorySummary.stockAdjustmentsAdded ?? 0) },
				{ label: 'Units removed by adjustment', value: numberFmt.format(inventorySummary.stockAdjustmentsDeducted ?? 0) }
			]
		};
	}

	const trustLine = (s: { requestsTotal?: number; incidents?: number; trustTierLabel?: string }) => ({
		meta: `${s.requestsTotal ?? 0} requests · ${s.incidents ?? 0} incidents`,
		...(s.trustTierLabel ? { badge: { label: s.trustTierLabel, tone: 'neutral' as const } } : {})
	});

	/** yyyy-mm-dd in the user's own timezone; toISOString() is UTC and can shift the day. */
	function localISO(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	function todayISO(): string {
		return localISO(new Date());
	}

	function monthStartISO(): string {
		const d = new Date();
		return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
	}

	function daysAgoISO(days: number): string {
		const d = new Date();
		d.setDate(d.getDate() - days);
		return localISO(d);
	}

	function monthLabel(ym: string): string {
		const [y, m] = ym.split('-').map(Number);
		return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}

	/** Show one whole calendar month; the current month stops at today. */
	function applyMonth(ym: string): void {
		if (!/^\d{4}-\d{2}$/.test(ym) || ym > todayISO().slice(0, 7)) return;
		const [y, m] = ym.split('-').map(Number);
		const lastDay = localISO(new Date(y, m, 0));
		selectedMonth = ym;
		datePreset = 'month';
		period = 'month';
		customFrom = `${ym}-01`;
		customTo = lastDay > todayISO() ? todayISO() : lastDay;
		scheduleLoad();
	}

	function shiftMonth(delta: number): void {
		const [y, m] = selectedMonth.split('-').map(Number);
		applyMonth(localISO(new Date(y, m - 1 + delta, 1)).slice(0, 7));
	}

	function formatRangeLabel(): string {
		if (datePreset === 'today') return 'Today';
		if (datePreset === 'month') return monthLabel(selectedMonth);
		if (datePreset === 'last7') return 'Last 7 Days';
		if (datePreset === 'mtd') return 'Month-to-Date';
		if (customFrom && customTo) {
			const fromLabel = new Date(customFrom).toLocaleDateString();
			const toLabel = new Date(customTo).toLocaleDateString();
			return `${fromLabel} to ${toLabel}`;
		}
		return 'Custom Range';
	}

	const selectedRange = $derived.by((): { from: string; to: string } | null => {
		if (datePreset === 'last7') return { from: daysAgoISO(7), to: todayISO() };
		if (customFrom && customTo) return { from: customFrom, to: customTo };
		return null;
	});

	const exportUserName = $derived.by(() => {
		const u = $user;
		return u ? `${u.firstName} ${u.lastName}`.trim().toUpperCase() : '';
	});

	function applyPreset(preset: DatePreset): void {
		datePreset = preset;
		if (preset === 'today') {
			period = 'week';
			customFrom = todayISO();
			customTo = todayISO();
		} else if (preset === 'last7') {
			period = 'week';
			customFrom = '';
			customTo = '';
		} else if (preset === 'mtd') {
			period = 'month';
			customFrom = monthStartISO();
			customTo = todayISO();
		} else if (preset === 'month') {
			applyMonth(selectedMonth);
			return;
		} else {
			customFrom = customFrom || monthStartISO();
			customTo = customTo || todayISO();
		}
		scheduleLoad();
	}

	function scheduleLoad(forceRefresh = false): void {
		if (!hasMounted) return;
		if (pendingLoadTimer) clearTimeout(pendingLoadTimer);

		// fetch a lightweight summary immediately for faster UI feedback
		void (async () => {
			try {
				const s = await fetchAnalyticsSummary({
					period,
					from: customFrom || undefined,
					to: customTo || undefined,
					classCodeId: selectedClassCodeId || undefined,
					instructorId: selectedInstructorId || undefined,
					studentId: selectedStudentId || undefined,
					custodianId: selectedCustodianId || undefined,
					forceRefresh
				});
				summaryReport = s as Partial<AnalyticsReport>;
			} catch (err) {
				console.error('[Reports] Failed to load summary', err);
			}
		})();

		pendingLoadTimer = setTimeout(() => {
			pendingLoadTimer = null;
			void loadReport(forceRefresh);
		}, 150);
	}

	async function loadReport(forceRefresh = false): Promise<void> {
		if (!browser) return;
		error = null;

		const hasCache = !!report;

		try {
			// 1. Overview
			if (forceRefresh || !summaryReport) {
				overviewLoading = true;
			}
			const overviewResult = await Promise.allSettled([
				fetchAnalyticsSummary({
					period,
					from: customFrom || undefined,
					to: customTo || undefined,
					classCodeId: selectedClassCodeId || undefined,
					instructorId: selectedInstructorId || undefined,
					studentId: selectedStudentId || undefined,
					custodianId: selectedCustodianId || undefined,
					forceRefresh
				})
			]);
			if (overviewResult[0].status === 'fulfilled') {
				summaryReport = overviewResult[0].value as Partial<AnalyticsReport>;
			}
			overviewLoading = false;

			// 2. Full report. Every tab reads the same payload, so fetch it once.
			if (forceRefresh || !hasCache) {
				borrowingLoading = true;
				inventoryLoading = true;
				studentRiskLoading = true;
			}
			const [fullResult] = await Promise.allSettled([
				fetchAnalytics({
					period,
					from: customFrom || undefined,
					to: customTo || undefined,
					classCodeId: selectedClassCodeId || undefined,
					instructorId: selectedInstructorId || undefined,
					studentId: selectedStudentId || undefined,
					custodianId: selectedCustodianId || undefined,
					forceRefresh
				})
			]);
			if (fullResult.status === 'fulfilled') {
				report = fullResult.value;
			} else if (!report) {
				throw fullResult.reason;
			}
		} catch (err) {
			console.error('[Reports] Sequential load failed:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
			toastStore.error(error, 'Analytics');
		} finally {
			overviewLoading = false;
			borrowingLoading = false;
			inventoryLoading = false;
			studentRiskLoading = false;
			loading = false;
		}
	}

	const totalRequests = $derived(
		(report?.borrowRequests ?? summaryReport?.borrowRequests)?.statusBreakdown?.reduce(
			(s, i) => s + i.count,
			0
		) ?? 0
	);
	const returnedCount = $derived(
		(report?.borrowRequests ?? summaryReport?.borrowRequests)?.statusBreakdown?.find(
			(s) => s.status === 'returned'
		)?.count ?? 0
	);
	const overdueCount = $derived(
		report?.borrowRequests?.overdueCount ?? summaryReport?.borrowRequests?.overdueCount ?? 0
	);
	const returnRate = $derived(
		totalRequests > 0 ? Math.round((returnedCount / totalRequests) * 100) : 0
	);
	const borrowingAvg = $derived(
		(report?.borrowRequests ?? summaryReport?.borrowRequests)?.borrowingAverages ?? {
			avgItemsPerRequest: 0,
			avgQuantityPerRequest: 0,
			totalRequests: 0
		}
	);
	const inventorySummary = $derived(
		(report?.inventory ?? summaryReport?.inventory)?.summary ?? {
			currentCount: 0,
			eomCount: 0,
			variance: 0,
			donations: 0,
			requiredCount: 0,
			lowStockCount: 0
		}
	);
	const inventoryVarianceRows = $derived(
		(report?.inventory.eomVariance ?? [])
			.filter((item) => item.variance !== 0)
			.slice()
			.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || b.variance - a.variance)
	);
	const inventoryOverTotal = $derived(
		inventoryVarianceRows.reduce((sum, item) => (item.variance > 0 ? sum + item.variance : sum), 0)
	);
	const inventoryShortTotal = $derived(
		inventoryVarianceRows.reduce((sum, item) => (item.variance < 0 ? sum + item.variance : sum), 0)
	);
	const studentTrustScores = $derived(
		(report?.studentRisk.trustScores ?? [])
			.filter((student) => typeof student.trustScore === 'number')
			.slice()
			.sort((a, b) => (a.trustScore ?? 0) - (b.trustScore ?? 0))
	);
	const averageTrustScore = $derived(
		studentTrustScores.length > 0
			? Math.round(
					studentTrustScores.reduce((sum, student) => sum + (student.trustScore ?? 0), 0) /
						studentTrustScores.length
				)
			: 0
	);
	const topBorrowedOverview = $derived(
		((report?.borrowRequests ?? summaryReport?.borrowRequests)?.itemsBorrowed ?? []).slice(0, 6)
	);
	const filteredBorrowedItemTotals = $derived.by(() => {
		const items = report?.borrowRequests.itemsBorrowed ?? [];
		const query = borrowedItemsQuery.trim().toLowerCase();
		if (!query) return items;
		return items.filter((item) =>
			[item.name, item.category].some((value) => (value ?? '').toLowerCase().includes(query))
		);
	});
	const filteredBorrowedItems = $derived.by(() => {
		const items = report?.borrowRequests.itemEntries ?? [];
		const query = borrowedItemsQuery.trim().toLowerCase();
		if (!query) return items;
		return items.filter((item) =>
			[
				item.name,
				item.category,
				item.studentName,
				item.studentEmail,
				item.requestId,
				item.requestStatus
			].some((value) => (value ?? '').toLowerCase().includes(query))
		);
	});
	const filteredBorrowers = $derived.by(() => {
		const borrowers = report?.borrowRequests.borrowers ?? [];
		const query = borrowersQuery.trim().toLowerCase();
		if (!query) return borrowers;
		return borrowers.filter(
			(borrower) =>
				borrower.studentName.toLowerCase().includes(query) ||
				borrower.studentEmail.toLowerCase().includes(query)
		);
	});
	const filteredInventoryVarianceRows = $derived.by(() => {
		const query = inventoryItemsQuery.trim().toLowerCase();
		// Start from the canonical variance rows (already excludes zero-variance)
		let rows = inventoryVarianceRows.slice();
		// Apply Over/Under filter
		if (inventoryVarianceFilter === 'over') {
			rows = rows.filter((r) => r.variance > 0);
		} else if (inventoryVarianceFilter === 'under') {
			rows = rows.filter((r) => r.variance < 0);
		}
		if (!query) return rows;
		return rows.filter((item) =>
			[
				item.name,
				item.category,
				String(item.quantity),
				String(item.eomCount),
				String(item.variance)
			].some((value) => value.toLowerCase().includes(query))
		);
	});
	const filteredRelatedRequestRows = $derived.by(() => {
		const query = relatedRequestsQuery.trim().toLowerCase();
		const drivers = report?.inventory.varianceDrivers ?? [];
		const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
		// Only include variance items that have a related driver with a real request context
		const candidates = inventoryVarianceRows.filter((item) => {
			const driver = driverById.get(item._id);
			if (!driver) return false;
			// Consider a driver "related" if it has a latestRequestId or at least one recorded request
			if (driver.latestRequestId && driver.latestRequestId.trim() !== '') return true;
			if ((driver.requestCount ?? 0) > 0) return true;
			return false;
		});
		if (!query) return candidates;
		return candidates.filter((item) => {
			const driver = driverById.get(item._id);
			return [
				item.name,
				item.category,
				driver?.studentName ?? '',
				driver?.latestRequestId ?? '',
				driver?.latestRequestStatus ?? '',
				String(driver?.requestCount ?? ''),
				String(driver?.totalBorrowedQuantity ?? '')
			].some((value) => value.toLowerCase().includes(query));
		});
	});
	const varianceItemsTotalPages = $derived(
		Math.max(1, Math.ceil(filteredInventoryVarianceRows.length / INVENTORY_PAGE_SIZE))
	);
	const paginatedVarianceItems = $derived.by(() => {
		const start = (varianceItemsPage - 1) * INVENTORY_PAGE_SIZE;
		return filteredInventoryVarianceRows.slice(start, start + INVENTORY_PAGE_SIZE);
	});
	const relatedRequestsTotalPages = $derived(
		Math.max(1, Math.ceil(filteredRelatedRequestRows.length / INVENTORY_PAGE_SIZE))
	);
	const paginatedRelatedRequestRows = $derived.by(() => {
		const start = (relatedRequestsPage - 1) * INVENTORY_PAGE_SIZE;
		return filteredRelatedRequestRows.slice(start, start + INVENTORY_PAGE_SIZE);
	});

	function buildPaginationTokens(current: number, total: number): Array<number | 'ellipsis'> {
		if (total <= 7) {
			return Array.from({ length: total }, (_, i) => i + 1);
		}

		// For larger totals, show current page + 2 neighbors on each side + always first and last
		const tokens = new Set<number>();
		tokens.add(1);
		tokens.add(total);

		// Add current and neighbors (2 on each side)
		for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
			tokens.add(i);
		}

		// Convert to sorted array
		const sorted = Array.from(tokens).sort((a, b) => a - b);
		const result: Array<number | 'ellipsis'> = [];

		// Build result with ellipsis between gaps
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
				result.push('ellipsis');
			}
			result.push(sorted[i]);
		}

		return result;
	}

	const varianceItemsPageTokens = $derived(
		buildPaginationTokens(varianceItemsPage, varianceItemsTotalPages)
	);
	const relatedRequestsPageTokens = $derived(
		buildPaginationTokens(relatedRequestsPage, relatedRequestsTotalPages)
	);

	// Borrowing Analytics Pagination
	const borrowedRowCount = $derived(
		borrowedView === 'item' ? filteredBorrowedItemTotals.length : filteredBorrowedItems.length
	);
	const borrowedItemsTotalPages = $derived(
		Math.max(1, Math.ceil(borrowedRowCount / INVENTORY_PAGE_SIZE))
	);
	const paginatedBorrowedItems = $derived.by(() => {
		const start = (borrowedItemsPage - 1) * INVENTORY_PAGE_SIZE;
		return filteredBorrowedItems.slice(start, start + INVENTORY_PAGE_SIZE);
	});
	const paginatedBorrowedItemTotals = $derived.by(() => {
		const start = (borrowedItemsPage - 1) * INVENTORY_PAGE_SIZE;
		return filteredBorrowedItemTotals.slice(start, start + INVENTORY_PAGE_SIZE);
	});
	const borrowedItemsPageTokens = $derived(
		buildPaginationTokens(borrowedItemsPage, borrowedItemsTotalPages)
	);

	const borrowersTotalPages = $derived(
		Math.max(1, Math.ceil(filteredBorrowers.length / INVENTORY_PAGE_SIZE))
	);
	const paginatedBorrowers = $derived.by(() => {
		const start = (borrowersPage - 1) * INVENTORY_PAGE_SIZE;
		return filteredBorrowers.slice(start, start + INVENTORY_PAGE_SIZE);
	});
	const borrowersPageTokens = $derived(buildPaginationTokens(borrowersPage, borrowersTotalPages));

	// Filter student trust scores
	const filteredStudentTrustScores = $derived.by(() => {
		const query = studentTrustQuery.trim().toLowerCase();
		if (!query) return studentTrustScores;
		return studentTrustScores.filter((student) =>
			[
				student.studentName ?? '',
				student.studentEmail ?? '',
				student.trustTierLabel ?? '',
				student.trustTier ?? ''
			].some((value) => value.toLowerCase().includes(query))
		);
	});

	// Student Trust Pagination
	const studentTrustTotalPages = $derived(
		Math.max(1, Math.ceil(filteredStudentTrustScores.length / INVENTORY_PAGE_SIZE))
	);
	const paginatedStudentTrustScores = $derived.by(() => {
		const start = (studentTrustPage - 1) * INVENTORY_PAGE_SIZE;
		return filteredStudentTrustScores.slice(start, start + INVENTORY_PAGE_SIZE);
	});
	const studentTrustPageTokens = $derived(
		buildPaginationTokens(studentTrustPage, studentTrustTotalPages)
	);

	const topBorrowedMax = $derived(
		topBorrowedOverview.length > 0
			? Math.max(...topBorrowedOverview.map((item) => item.totalQuantity), 1)
			: 1
	);
	const trustTierBreakdown = $derived.by(() => {
		const tiers: Array<{ key: string; label: string; count: number; color: string }> = [
			{ key: 'excellent', label: 'Excellent', count: 0, color: 'bg-emerald-500' },
			{ key: 'good', label: 'Good', count: 0, color: 'bg-pink-500' },
			{ key: 'fair', label: 'Fair', count: 0, color: 'bg-amber-500' },
			{ key: 'poor', label: 'Poor', count: 0, color: 'bg-orange-500' },
			{ key: 'critical', label: 'Critical', count: 0, color: 'bg-rose-500' }
		];
		for (const student of studentTrustScores) {
			const idx = tiers.findIndex((tier) => tier.key === (student.trustTier ?? ''));
			if (idx >= 0) tiers[idx].count += 1;
		}
		return tiers;
	});
	const trustTierMax = $derived(
		trustTierBreakdown.length > 0 ? Math.max(...trustTierBreakdown.map((tier) => tier.count), 1) : 1
	);
	const inventoryCompareMax = $derived(
		Math.max(
			inventorySummary.currentCount,
			inventorySummary.eomCount,
			inventoryOverTotal,
			Math.abs(inventoryShortTotal),
			1
		)
	);

	function getBorrowStatusColor(status: string): string {
		const key = status.toLowerCase();
		if (key === 'returned') return '#10b981';
		if (key === 'borrowed' || key === 'active') return '#ec4899';
		if (key === 'approved' || key === 'ready') return '#3b82f6';
		if (key === 'cancelled' || key === 'rejected') return '#94a3b8';
		if (key === 'missing') return '#f43f5e';
		return '#a855f7';
	}

	const statusChartSeries = $derived.by(() => {
		const rows = (report?.borrowRequests ?? summaryReport?.borrowRequests)?.statusBreakdown ?? [];
		const total = rows.reduce((sum, row) => sum + row.count, 0);
		if (total === 0)
			return [] as Array<{ status: string; count: number; pct: number; color: string }>;
		return rows
			.map((row) => ({
				status: row.status,
				count: row.count,
				pct: (row.count / total) * 100,
				color: getBorrowStatusColor(row.status)
			}))
			.sort((a, b) => b.count - a.count);
	});

	const statusDonutStyle = $derived.by(() => {
		if (statusChartSeries.length === 0) return 'conic-gradient(#e5e7eb 0 360deg)';
		let offset = 0;
		const parts: string[] = [];
		for (const slice of statusChartSeries) {
			const next = offset + slice.pct;
			parts.push(`${slice.color} ${offset}% ${next}%`);
			offset = next;
		}
		return `conic-gradient(${parts.join(', ')})`;
	});

	function getTrustTierClasses(tier?: string): string {
		if (tier === 'excellent') return 'bg-emerald-100 text-emerald-700';
		if (tier === 'good') return 'bg-green-100 text-green-700';
		if (tier === 'fair') return 'bg-amber-100 text-amber-700';
		if (tier === 'poor') return 'bg-orange-100 text-orange-700';
		if (tier === 'critical') return 'bg-rose-100 text-rose-700';
		return 'bg-gray-100 text-gray-700';
	}

	function getTrustBarClasses(score?: number): string {
		if ((score ?? 0) >= 90) return 'bg-emerald-500';
		if ((score ?? 0) >= 75) return 'bg-green-500';
		if ((score ?? 0) >= 60) return 'bg-amber-500';
		if ((score ?? 0) >= 40) return 'bg-orange-500';
		return 'bg-rose-500';
	}

	function getTrustScoreTextClass(tier?: string): string {
		if (tier === 'excellent') return 'text-emerald-700';
		if (tier === 'good') return 'text-pink-700';
		if (tier === 'fair') return 'text-amber-700';
		if (tier === 'poor') return 'text-orange-700';
		if (tier === 'critical') return 'text-red-700';
		return 'text-gray-900';
	}

	onMount(() => {
		hasMounted = true;
		// Load dropdown options asynchronously
		void (async () => {
			try {
				const classRes = await classCodesAPI.getAll({ limit: 1000 });
				classCodes = classRes.classCodes;

				const instRes = await usersAPI.getAll({ role: 'instructor', limit: 1000 });
				instructors = instRes.users;

				const studRes = await usersAPI.getAll({ role: 'student', limit: 1000 });
				students = studRes.users;

				const custRes = await usersAPI.getAll({ role: 'custodian', limit: 1000 });
				custodians = custRes.users;
			} catch (e) {
				console.error('Failed to load filter options', e);
			}
		})();

		// Deep link: ?tab=<id> opens that tab (e.g. dashboard "Details" links).
		const TABS: Tab[] = ['overview', 'borrowing', 'inventory', 'returns', 'students', 'processed', 'walk-in'];
		const tabParam = get(page).url.searchParams.get('tab') as Tab | null;
		if (tabParam && TABS.includes(tabParam)) activeTab = tabParam;

		// Inventory figures are compared against the shelf, so a deep link to it
		// always revalidates; otherwise the cached report is fine until a change.
		if (!initialReport || tabParam === 'inventory') {
			void loadReport(tabParam === 'inventory');
		}
		unsubscribeSSE = subscribeToAnalyticsChanges(() => scheduleLoad(true));
		return () => {
			if (pendingLoadTimer) clearTimeout(pendingLoadTimer);
			unsubscribeSSE?.();
		};
	});

	$effect(() => {
		selectedClassCodeId;
		selectedInstructorId;
		selectedStudentId;
		selectedCustodianId;
		if (hasMounted) {
			scheduleLoad();
		}
	});

	$effect(() => {
		inventoryItemsQuery;
		varianceItemsPage = 1;
	});

	$effect(() => {
		inventoryVarianceFilter;
		varianceItemsPage = 1;
	});

	$effect(() => {
		relatedRequestsQuery;
		relatedRequestsPage = 1;
	});

	$effect(() => {
		borrowedItemsQuery;
		borrowedView;
		borrowedItemsPage = 1;
	});

	$effect(() => {
		borrowersQuery;
		borrowersPage = 1;
	});

	$effect(() => {
		studentTrustQuery;
		studentTrustPage = 1;
	});

	$effect(() => {
		filteredInventoryVarianceRows.length;
		if (varianceItemsPage > varianceItemsTotalPages) {
			varianceItemsPage = varianceItemsTotalPages;
		}
	});

	$effect(() => {
		filteredRelatedRequestRows.length;
		if (relatedRequestsPage > relatedRequestsTotalPages) {
			relatedRequestsPage = relatedRequestsTotalPages;
		}
	});

	$effect(() => {
		borrowedRowCount;
		if (borrowedItemsPage > borrowedItemsTotalPages) {
			borrowedItemsPage = borrowedItemsTotalPages;
		}
	});

	$effect(() => {
		filteredBorrowers.length;
		if (borrowersPage > borrowersTotalPages) {
			borrowersPage = borrowersTotalPages;
		}
	});

	$effect(() => {
		filteredStudentTrustScores.length;
		if (studentTrustPage > studentTrustTotalPages) {
			studentTrustPage = studentTrustTotalPages;
		}
	});

	// ─── Export ───────────────────────────────────────────────────────────

	let exporting = $state(false);

	const EXPORT_SECTIONS: ExportSection[] = [
		{ id: 'overview', label: 'Overview', description: 'Totals, top items, status count, overdue list' },
		{ id: 'borrowing', label: 'Borrowing Analytics', description: 'Time charts, borrower metrics, individual transactions' },
		{ id: 'inventory', label: 'Inventory', description: 'EOM Variance, damage rates, alert logs, required counts' },
		{ id: 'students', label: 'Student Risk', description: 'Trust scores, risk tiers, repeat offender profiles' },
		{ id: 'walk-in', label: 'Walk-in Transactions', description: 'Desk walk-in checkouts to students and guests' }
	];

	const classOptions = $derived(
		classCodes.map((c) => ({ id: c.id, label: `${c.courseCode} - ${c.section} (${c.code})` }))
	);
	const studentOptions = $derived(students.map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}` })));
	const instructorOptions = $derived(instructors.map((i) => ({ id: i.id, label: `${i.firstName} ${i.lastName}` })));
	const custodianOptions = $derived(custodians.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` })));
	// Walk-in borrowers (registered students or guests) seen in the loaded data.
	const walkInPeopleOptions = $derived(
		Array.from(
			new Map(
				(walkInSource?.transactions ?? []).map((w) => [
					w.studentName,
					{ id: w.studentName, label: w.studentId ? `${w.studentName} · ${w.studentId}` : w.studentName }
				])
			).values()
		)
	);

	async function handleGenerate(cfg: AnalyticsExportConfig) {
		if (!report || exporting) return;
		exporting = true;
		try {
			const params = new URLSearchParams();
			if (cfg.timeframeMode === 'current') {
				params.set('period', period);
				if (customFrom) params.set('from', customFrom);
				if (customTo) params.set('to', customTo);
			} else {
				params.set('period', 'month');
				if (cfg.customFrom) params.set('from', cfg.customFrom);
				if (cfg.customTo) params.set('to', cfg.customTo);
			}
			for (const id of cfg.classIds) params.append('class_code_id[]', id);
			for (const id of cfg.instructorIds) params.append('instructor_id[]', id);
			for (const id of cfg.studentIds) params.append('student_id[]', id);
			for (const id of cfg.custodianIds) params.append('custodian_id[]', id);
			for (const p of cfg.walkInPersons) params.append('walk_in_person[]', p);
			for (const key of cfg.sections) params.append('sections[]', key);

			const res = await fetch(`/api/reports/analytics?${params.toString()}`, { credentials: 'include' });
			if (!res.ok) throw new Error('Export failed');
			const data = (await res.json()) as AnalyticsReport;

			const rangeLabel =
				cfg.timeframeMode === 'custom' && cfg.customFrom && cfg.customTo
					? `${cfg.customFrom} – ${cfg.customTo}`
					: formatRangeLabel();
			const u = get(user);
			await downloadAnalyticsExcel({
				report: data,
				rangeLabel,
				filtersLabel: data?.meta?.filtersLabel ?? 'All',
				userName: u ? `${u.firstName} ${u.lastName}`.trim().toUpperCase() : '',
				sections: cfg.sections,
				fileName: `chtm-cooks-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`
			});
			toastStore.success('Report exported as Excel file');
			showExportModal = false;
		} catch {
			toastStore.error('Failed to export report. Please try again.');
		} finally {
			exporting = false;
		}
	}
	let showExportModal = $state(false);
</script>

<svelte:head>
	{#if documentTitle}<title>{documentTitle}</title>{/if}
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4" data-tour={tour('header')}>
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{subtitle}
			</p>
		</div>
		<button
			onclick={() => {
				if (report) openExportModal();
			}}
			disabled={!report || exporting}
			class="flex shrink-0 items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			<Download size={15} />
			Export Excel
		</button>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4" data-tour={tour('filters')}>
		<div class="flex flex-wrap items-center gap-3">
			<span class="text-sm font-semibold text-gray-700">Date Range:</span>
			{#each [{ id: 'today', label: 'Today' }, { id: 'last7', label: 'Last 7 Days' }, { id: 'mtd', label: 'Month-to-Date' }, { id: 'month', label: 'By Month' }, { id: 'custom', label: 'Custom' }] as option}
				<button
					onclick={() => applyPreset(option.id as DatePreset)}
					class="rounded-lg px-4 py-2 text-sm font-medium transition {datePreset === option.id
						? 'bg-pink-600 text-white shadow-sm'
						: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
				>
					{option.label}
				</button>
			{/each}
		</div>
		{#if datePreset === 'month'}
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={() => shiftMonth(-1)}
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
					aria-label="Previous month"
				>‹</button>
				<input
					type="month"
					value={selectedMonth}
					max={todayISO().slice(0, 7)}
					onchange={(e) => applyMonth(e.currentTarget.value)}
					aria-label="Month"
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm"
				/>
				<button
					type="button"
					onclick={() => shiftMonth(1)}
					disabled={selectedMonth >= todayISO().slice(0, 7)}
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
					aria-label="Next month"
				>›</button>
				<span class="text-sm font-medium text-gray-700">{monthLabel(selectedMonth)}</span>
			</div>
		{/if}
		{#if datePreset === 'custom'}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<label for="custom-from" class="block text-xs font-medium text-gray-700">From</label>
					<input
						id="custom-from"
						type="date"
						bind:value={customFrom}
						onchange={() => scheduleLoad()}
						class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label for="custom-to" class="block text-xs font-medium text-gray-700">To</label>
					<input
						id="custom-to"
						type="date"
						bind:value={customTo}
						onchange={() => scheduleLoad()}
						class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>
			</div>
		{/if}

		<div class="border-t border-gray-100 pt-4">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<div>
					<label for="filter-class" class="block text-xs font-semibold uppercase tracking-wider text-gray-500">Class / Section</label>
					<select id="filter-class" bind:value={selectedClassCodeId} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
						<option value="">All Classes</option>
						{#each classCodes as classCode}
							<option value={classCode.id}>{classCode.courseCode} - {classCode.section} ({classCode.code})</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="filter-instructor" class="block text-xs font-semibold uppercase tracking-wider text-gray-500">Instructor</label>
					<select id="filter-instructor" bind:value={selectedInstructorId} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
						<option value="">All Instructors</option>
						{#each instructors as instructor}
							<option value={instructor.id}>{instructor.firstName} {instructor.lastName}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="filter-student" class="block text-xs font-semibold uppercase tracking-wider text-gray-500">Student</label>
					<select id="filter-student" bind:value={selectedStudentId} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
						<option value="">All Students</option>
						{#each students as student}
							<option value={student.id}>{student.firstName} {student.lastName}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="filter-custodian" class="block text-xs font-semibold uppercase tracking-wider text-gray-500">Custodian / Staff</label>
					<select id="filter-custodian" bind:value={selectedCustodianId} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
						<option value="">All Custodians</option>
						{#each custodians as custodian}
							<option value={custodian.id}>{custodian.firstName} {custodian.lastName}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white shadow-sm" data-tour={tour('tabs')}>
		<div class="relative border-b border-gray-200 px-2 sm:px-4">
			<!-- All tabs fit on a desktop. On narrower screens the row scrolls
			     sideways without a scrollbar; a fade marks the side with more. -->
			<nav
				bind:this={tabsNav}
				onscroll={updateTabOverflow}
				class="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				aria-label="Report tabs"
			>
				{#each [{ id: 'overview', label: 'Overview', icon: BarChart3 }, { id: 'borrowing', label: 'Borrowing Analytics', icon: Package }, { id: 'inventory', label: 'Inventory', icon: Package }, { id: 'returns', label: 'Returned Items', icon: Package }, { id: 'students', label: 'Student Risk', icon: Users }, { id: 'processed', label: 'Processed Transactions', icon: FileText }, { id: 'walk-in', label: 'Walk-in Transactions', icon: Users }] as tab}
					<button
						onclick={(e) => {
							activeTab = tab.id as Tab;
							e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
						}}
						aria-current={activeTab === tab.id ? 'page' : undefined}
						class="flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition {activeTab ===
						tab.id
							? 'border-pink-600 text-pink-600'
							: 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}"
					>
						<!-- Laptop widths drop the icons so every tab still fits on one row. -->
						<tab.icon size={16} class="lg:max-2xl:hidden" />
						{tab.label}
					</button>
				{/each}
			</nav>
			{#if tabsOverflow.left}
				<div class="pointer-events-none absolute inset-y-0 left-0 w-10 rounded-tl-xl bg-linear-to-r from-white to-transparent" aria-hidden="true"></div>
			{/if}
			{#if tabsOverflow.right}
				<div class="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-tr-xl bg-linear-to-l from-white to-transparent" aria-hidden="true"></div>
			{/if}
		</div>

		{#if (activeTab === 'overview' && overviewLoading) || (activeTab === 'borrowing' && borrowingLoading) || (activeTab === 'inventory' && inventoryLoading) || (activeTab === 'students' && studentRiskLoading)}
			<div class="p-6">
				<ReportsSkeletonLoader view={activeTab} />
			</div>
		{:else if activeTab === 'processed'}
			<div class="p-6">
				<ProcessedTransactionsTab />
			</div>
		{:else if activeTab === 'walk-in'}
			<WalkInTransactionsTab data={walkInSource} />
		{:else if activeTab === 'returns'}
			<ReturnedItemsReport
				range={selectedRange}
				rangeLabel={formatRangeLabel()}
				classCodeIds={selectedClassCodeId ? [selectedClassCodeId] : []}
				studentIds={selectedStudentId ? [selectedStudentId] : []}
				refreshKey={report?.meta?.generatedAt ?? null}
				userName={exportUserName}
			/>
		{:else if error}
			<div class="px-6 py-12">
				<div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
					{error}
				</div>
			</div>
		{:else if (activeTab === 'overview' && summaryReport) || report}
			<div class="space-y-6 p-6">
				{#if activeTab === 'overview'}
					<div data-tab-panel="overview" class="space-y-6">
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour={tour('stats')}>
							<div
								class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md sm:p-5 {DETAIL_HOVER}"
								{...opensDetail(() => requestsDetail('Total Requests', formatRangeLabel(), detailEntries), 'View details for Total Requests')}
							>
								<div class="flex items-start justify-between">
									<div>
										<p class="text-sm font-semibold text-gray-700">Total Requests</p>
										<p class="mt-2 text-3xl font-bold text-gray-900">
											{numberFmt.format(totalRequests)}
										</p>
										<p class="mt-1 text-xs text-gray-600">Period total</p>
									</div>
									<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-600 sm:h-12 sm:w-12">
										<BarChart3 size={20} class="text-pink-600" />
									</div>
								</div>
							</div>
							<div
								class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md sm:p-5 {DETAIL_HOVER}"
								{...opensDetail(() => requestsDetail('Returned Requests', `${returnRate}% of requests in ${formatRangeLabel()}`, detailEntries, (e) => e.requestStatus === 'returned', statusBadge('returned')), 'View details for Return Rate')}
							>
								<div class="flex items-start justify-between">
									<div>
										<p class="text-sm font-semibold text-gray-700">Return Rate</p>
										<p class="mt-2 text-3xl font-bold {totalRequests === 0 ? 'text-gray-900' : returnRate >= 85 ? 'text-emerald-600' : 'text-amber-600'}">
											{returnRate}%
										</p>
										<p class="mt-1 text-xs text-gray-600">Target: 90%</p>
									</div>
									<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-600 sm:h-12 sm:w-12">
										<TrendingUp size={20} class="text-pink-600" />
									</div>
								</div>
							</div>
							<div
								class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md sm:p-5 {DETAIL_HOVER}"
								{...opensDetail(() => overdueDetail(report?.borrowRequests?.overdueRequests ?? []), 'View details for Overdue Items')}
							>
								<div class="flex items-start justify-between">
									<div>
										<p class="text-sm font-semibold text-gray-700">Overdue Items</p>
										<p class="mt-2 text-3xl font-bold {overdueCount > 0 ? 'text-rose-600' : 'text-gray-900'}">
											{numberFmt.format(overdueCount)}
										</p>
										<p class="mt-1 text-xs text-gray-600">Requires attention</p>
									</div>
									<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-600 sm:h-12 sm:w-12">
										<AlertTriangle size={20} class="text-pink-600" />
									</div>
								</div>
							</div>
						</div>

						<div class="grid gap-4 lg:grid-cols-2">
							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<div class="flex items-center justify-between">
									<h3 class="text-lg font-semibold text-gray-900">Borrowing Status Mix</h3>
									<p class="text-xs text-gray-500">{numberFmt.format(totalRequests)} requests</p>
								</div>
								{#if statusChartSeries.length === 0}
									<div
										class="mt-4 flex min-h-55 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
									>
										<div class="max-w-sm">
											<div
												class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
											>
												<BarChart3 size={32} class="text-pink-600" />
											</div>
											<h4 class="mt-6 text-base font-semibold text-gray-900">No status data</h4>
											<p class="mt-2 text-sm leading-6 text-gray-600">
												Borrowing status distribution will appear here once requests are recorded in
												the selected range.
											</p>
										</div>
									</div>
								{:else}
									<div class="mt-4 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
										<div
											class="mx-auto h-40 w-40 rounded-full"
											style={`background: ${statusDonutStyle}`}
										>
											<div
												class="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-white text-center"
											>
												<div>
													<p class="text-xl font-bold text-gray-900">
														{numberFmt.format(totalRequests)}
													</p>
													<p class="text-[11px] tracking-wide text-gray-500 uppercase">Total</p>
												</div>
											</div>
										</div>
										<div class="space-y-2">
											{#each statusChartSeries as row}
												<div
													class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 {DETAIL_HOVER}"
													{...opensDetail(
														() =>
															requestsDetail(
																statusBadge(row.status).label,
																`Requests with this status in ${formatRangeLabel()}`,
																detailEntries,
																(e) => e.requestStatus === row.status,
																statusBadge(row.status)
															),
														`View ${row.status.replace(/_/g, ' ')} requests`
													)}
												>
													<div class="flex items-center gap-2">
														<span class="h-2.5 w-2.5 rounded-full" style={`background:${row.color}`}
														></span>
														<span class="text-sm font-medium text-gray-700 capitalize"
															>{displayStatusKey(row.status).replace(/_/g, ' ')}</span
														>
													</div>
													<span class="text-sm font-semibold text-gray-900"
														>{row.count} ({row.pct.toFixed(0)}%)</span
													>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>

							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<div class="flex items-center justify-between">
									<h3 class="text-lg font-semibold text-gray-900">Top Borrowed Items</h3>
									<p class="text-xs text-gray-500">By quantity</p>
								</div>
								<div class="mt-4 space-y-3">
									{#if topBorrowedOverview.length === 0}
										<div
											class="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
										>
											<div class="max-w-sm">
												<div
													class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
												>
													<Package size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">
													No borrowed items
												</h4>
												<p class="mt-2 text-sm leading-6 text-gray-600">
													Top borrowed item trends will appear here once requests are recorded in
													the selected range.
												</p>
											</div>
										</div>
									{:else}
										{#each topBorrowedOverview as item}
											<div
												class="-mx-2 rounded-lg px-2 py-1 {DETAIL_HOVER}"
												{...opensDetail(() => borrowedItemDetail(item, detailEntries), `View who borrowed ${item.name}`)}
											>
												<div class="mb-1 flex items-center justify-between">
													<p class="truncate text-sm font-medium text-gray-800">{item.name}</p>
													<p class="text-xs font-semibold text-pink-700">{item.totalQuantity}</p>
												</div>
												<div class="h-2.5 rounded-full bg-gray-100">
													<div
														class="h-2.5 rounded-full bg-pink-500"
														style={`width: ${(item.totalQuantity / topBorrowedMax) * 100}%`}
													></div>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						</div>

						<div class="grid gap-4">

							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<div class="flex items-center justify-between">
									<h3 class="text-lg font-semibold text-gray-900">Inventory & Risk Signals</h3>
									<p class="text-xs text-gray-500">Cross-tab snapshot</p>
								</div>

								<div class="mt-4 space-y-4">
									<div>
										<p class="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
											Inventory Compare
										</p>
										<div class="space-y-2">
											{#each [{ label: 'Current', value: inventorySummary.currentCount, color: 'bg-gray-700' }, { label: 'EOM', value: inventorySummary.eomCount, color: 'bg-slate-500' }, { label: 'Over (+)', value: inventoryOverTotal, color: 'bg-emerald-500' }, { label: 'Variance (-)', value: Math.abs(inventoryShortTotal), color: 'bg-rose-500' }] as row}
												<div
													class="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 {DETAIL_HOVER}"
													{...opensDetail(
														() =>
															row.label === 'Over (+)'
																? varianceItemsDetail(true)
																: row.label === 'Variance (-)'
																	? varianceItemsDetail(false)
																	: inventoryCountDetail(row.label),
														`View details for ${row.label}`
													)}
												>
													<p class="w-24 text-xs font-medium text-gray-600">{row.label}</p>
													<div class="h-2.5 flex-1 rounded-full bg-gray-100">
														<div
															class={`h-2.5 rounded-full ${row.color}`}
															style={`width: ${(row.value / inventoryCompareMax) * 100}%`}
														></div>
													</div>
													<p class="w-16 text-right text-xs font-semibold text-gray-700">
														{numberFmt.format(row.value)}
													</p>
												</div>
											{/each}
										</div>
									</div>

									<div>
										<p class="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
											Student Trust Tiers
										</p>
										<div class="space-y-2">
											{#each trustTierBreakdown as tier}
												<div
													class="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 {DETAIL_HOVER}"
													{...opensDetail(
														() =>
															studentsDetail(
																`${tier.label} trust`,
																'Students in this trust tier',
																studentTrustScores.filter((s) => s.trustTier === tier.key),
																trustLine
															),
														`View ${tier.label} students`
													)}
												>
													<p class="w-24 text-xs font-medium text-gray-600">{tier.label}</p>
													<div class="h-2.5 flex-1 rounded-full bg-gray-100">
														<div
															class={`h-2.5 rounded-full ${tier.color}`}
															style={`width: ${(tier.count / trustTierMax) * 100}%`}
														></div>
													</div>
													<p class="w-8 text-right text-xs font-semibold text-gray-700">
														{tier.count}
													</p>
												</div>
											{/each}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if report}
					{#if activeTab === 'borrowing'}
						<div data-tab-panel="borrowing">
							<div class="space-y-6">
								<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
									<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
										<div>
											<h3 class="text-lg font-semibold text-gray-900">Borrowing Analytics</h3>
											<p class="mt-1 text-sm text-gray-600">Selected range: {formatRangeLabel()}</p>
										</div>
										<p class="text-xs text-gray-500">
											All borrowed items and borrowers in the selected period
										</p>
									</div>

									<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
										<div
											class="rounded-xl border border-gray-200 bg-gray-50 p-4 {DETAIL_HOVER}"
											{...opensDetail(() => requestsDetail('Total Requests', formatRangeLabel(), detailEntries), 'View all requests')}
										>
											<p class="text-sm text-gray-600">Total Requests</p>
											<p class="mt-2 text-2xl font-bold text-gray-900">
												{numberFmt.format(
													summaryReport?.borrowRequests?.borrowingAverages?.totalRequests ??
														borrowingAvg.totalRequests
												)}
											</p>
										</div>
										<div
											class="rounded-xl border border-gray-200 bg-gray-50 p-4 {DETAIL_HOVER}"
											{...opensDetail(
												() => requestsDetail('Average Items per Request', `Every request line in ${formatRangeLabel()}`, detailEntries),
												'View the requests behind the average items per request'
											)}
										>
											<p class="text-sm text-gray-600">Avg Items / Request</p>
											<p class="mt-2 text-2xl font-bold text-pink-700">
												{(
													summaryReport?.borrowRequests?.borrowingAverages?.avgItemsPerRequest ??
													borrowingAvg.avgItemsPerRequest ??
													0
												).toFixed(1)}
											</p>
										</div>
										<div
											class="rounded-xl border border-gray-200 bg-gray-50 p-4 {DETAIL_HOVER}"
											{...opensDetail(
												() => requestsDetail('Average Quantity per Request', `Every request line in ${formatRangeLabel()}`, detailEntries),
												'View the requests behind the average quantity per request'
											)}
										>
											<p class="text-sm text-gray-600">Avg Quantity / Request</p>
											<p class="mt-2 text-2xl font-bold text-purple-700">
												{(
													summaryReport?.borrowRequests?.borrowingAverages?.avgQuantityPerRequest ??
													borrowingAvg.avgQuantityPerRequest ??
													0
												).toFixed(1)}
											</p>
										</div>
									</div>
								</div>

								<div class="grid gap-4 lg:grid-cols-2">
									<div class="rounded-xl border border-gray-200 bg-white p-5">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<h3 class="text-lg font-semibold text-gray-900">Borrowed Items</h3>
											<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="Borrowed items view">
												{#each [{ id: 'entry', label: 'By request' }, { id: 'item', label: 'By item' }] as opt (opt.id)}
													<button
														type="button"
														onclick={() => (borrowedView = opt.id as 'entry' | 'item')}
														aria-pressed={borrowedView === opt.id}
														class="rounded-md px-2.5 py-1 text-xs font-medium transition {borrowedView === opt.id
															? 'bg-white text-pink-700 shadow-sm'
															: 'text-gray-600 hover:text-gray-900'}"
													>
														{opt.label}
													</button>
												{/each}
											</div>
										</div>
										<p class="mt-1 text-xs text-gray-600">
											{#if borrowedView === 'item'}
												{filteredBorrowedItemTotals.length} of {report.borrowRequests.itemsBorrowed.length} unique items in the selected range
											{:else}
												{filteredBorrowedItems.length} of {report.borrowRequests.itemEntries.length} borrowed
												item entries (including currently borrowed items in student possession)
											{/if}
										</p>
										<div class="mt-3">
											<label
												for="borrowed-items-search"
												class="mb-1 block text-xs font-medium text-gray-600"
												>Search borrowed items</label
											>
											<div class="relative">
												<Search
													size={16}
													class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
												/>
												<input
													id="borrowed-items-search"
													type="text"
													bind:value={borrowedItemsQuery}
													placeholder="Search by item name or category"
													class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 focus:outline-none"
												/>
												{#if borrowedItemsQuery}
													<button
														type="button"
														onclick={() => (borrowedItemsQuery = '')}
														class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
														aria-label="Clear borrowed items search"
													>
														<X size={14} />
													</button>
												{/if}
											</div>
										</div>
										<div class="mt-4 flex min-h-80 flex-col rounded-lg border border-gray-200">
											{#if report.borrowRequests.itemEntries.length === 0}
												<div
													class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
												>
													<div class="max-w-sm">
														<div
															class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
														>
															<FileText size={32} class="text-pink-600" />
														</div>
														<h4 class="mt-6 text-base font-semibold text-gray-900">
															No borrowed items
														</h4>
														<p class="mt-2 text-sm leading-6 text-gray-600">
															Borrowed items for the selected range will appear here once requests
															are recorded.
														</p>
													</div>
												</div>
											{:else if borrowedRowCount === 0}
												<div
													class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
												>
													<div class="max-w-sm">
														<div
															class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
														>
															<Search size={32} class="text-pink-600" />
														</div>
														<h4 class="mt-6 text-base font-semibold text-gray-900">
															No matches found
														</h4>
														<p class="mt-2 text-sm leading-6 text-gray-600">
															Try a different item name or category.
														</p>
													</div>
												</div>
											{:else}
												<div class="space-y-2 overflow-y-auto p-3">
													{#if borrowedView === 'item'}
														{#each paginatedBorrowedItemTotals as item (item.id)}
															<button type="button" onclick={() => (borrowDetail = { kind: 'item', subject: item })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
																<div class="flex items-center justify-between gap-3">
																	{#if item.picture}
																		<img src={item.picture} alt={item.name} loading="lazy" class="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover" />
																	{:else}
																		<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-400" aria-hidden="true">
																			<Package class="h-4 w-4" />
																		</div>
																	{/if}
																	<div class="min-w-0 flex-1">
																		<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
																		<p class="text-xs text-gray-600">{item.category}</p>
																	</div>
																	<div class="ml-3 text-right">
																		<p class="text-sm font-bold text-pink-600">{item.totalQuantity}</p>
																		<p class="text-xs text-gray-500">{item.borrowCount} request{item.borrowCount === 1 ? '' : 's'}</p>
																	</div>
																</div>
															</button>
														{/each}
													{:else}
													{#each paginatedBorrowedItems as item}
														<button type="button" onclick={() => (borrowDetail = { kind: 'entry', subject: item })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
															<div class="flex items-center justify-between gap-3">
																{#if item.picture}
																	<img src={item.picture} alt={item.name} loading="lazy" class="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover" />
																{:else}
																	<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-400" aria-hidden="true">
																		<Package class="h-4 w-4" />
																	</div>
																{/if}
																<div class="min-w-0 flex-1">
																	<p class="truncate text-sm font-medium text-gray-900">
																		{item.name}
																	</p>
																	<p class="text-xs text-gray-600">
																		{item.category} · {item.studentName || 'Unknown Student'}
																	</p>
																</div>
																<div class="ml-3 text-right">
																	<p class="text-sm font-bold text-pink-600">{item.quantity}</p>
																	<p class="text-xs text-gray-500">
																		Qty · #{item.requestId.slice(-6).toUpperCase()}
																	</p>
																</div>
															</div>
														</button>
													{/each}
													{/if}
												</div>
												{#if borrowedItemsTotalPages > 1}
													<div
														class="mt-auto flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2"
													>
														<p class="text-xs text-gray-600">
															Showing {(borrowedItemsPage - 1) * INVENTORY_PAGE_SIZE + 1}-{Math.min(
																borrowedItemsPage * INVENTORY_PAGE_SIZE,
																borrowedRowCount
															)} of {borrowedRowCount} {borrowedView === 'item' ? 'items' : 'borrowed entries (active included)'}
														</p>
														<div class="flex items-center gap-1.5">
															<button
																type="button"
																onclick={() =>
																	(borrowedItemsPage = Math.max(1, borrowedItemsPage - 1))}
																disabled={borrowedItemsPage === 1}
																class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
																aria-label="Previous borrowed items page"
															>
																<svg
																	class="h-4 w-4"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																>
																	<path
																		fill-rule="evenodd"
																		d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
															<nav
																class="isolate inline-flex items-center gap-1"
																aria-label="Borrowed items pagination"
															>
																{#each borrowedItemsPageTokens as token}
																	{#if token === 'ellipsis'}
																		<span
																			class="inline-flex h-8 min-w-8 items-center justify-center px-1 text-xs font-medium text-gray-500"
																			>...</span
																		>
																	{:else}
																		<button
																			type="button"
																			onclick={() => (borrowedItemsPage = token)}
																			class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold {borrowedItemsPage ===
																			token
																				? 'bg-pink-600 text-white shadow-sm'
																				: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}"
																		>
																			{token}
																		</button>
																	{/if}
																{/each}
															</nav>
															<button
																type="button"
																onclick={() =>
																	(borrowedItemsPage = Math.min(
																		borrowedItemsTotalPages,
																		borrowedItemsPage + 1
																	))}
																disabled={borrowedItemsPage === borrowedItemsTotalPages}
																class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
																aria-label="Next borrowed items page"
															>
																<svg
																	class="h-4 w-4"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																>
																	<path
																		fill-rule="evenodd"
																		d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
														</div>
													</div>
												{/if}
											{/if}
										</div>
									</div>

									<div class="rounded-xl border border-gray-200 bg-white p-5">
										<h3 class="text-lg font-semibold text-gray-900">Borrowers</h3>
										<p class="mt-1 text-xs text-gray-600">
											{filteredBorrowers.length} of {report.borrowRequests.borrowers.length} students
											in the selected range
										</p>
										<div class="mt-3">
											<label
												for="borrowers-search"
												class="mb-1 block text-xs font-medium text-gray-600">Search borrowers</label
											>
											<div class="relative">
												<Search
													size={16}
													class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
												/>
												<input
													id="borrowers-search"
													type="text"
													bind:value={borrowersQuery}
													placeholder="Search by student name or email"
													class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 focus:outline-none"
												/>
												{#if borrowersQuery}
													<button
														type="button"
														onclick={() => (borrowersQuery = '')}
														class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
														aria-label="Clear borrowers search"
													>
														<X size={14} />
													</button>
												{/if}
											</div>
										</div>
										<div class="mt-4 flex min-h-80 flex-col rounded-lg border border-gray-200">
											{#if report.borrowRequests.borrowers.length === 0}
												<div
													class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
												>
													<div class="max-w-sm">
														<div
															class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
														>
															<FileText size={32} class="text-pink-600" />
														</div>
														<h4 class="mt-6 text-base font-semibold text-gray-900">No borrowers</h4>
														<p class="mt-2 text-sm leading-6 text-gray-600">
															Borrower records for the selected range will appear here once requests
															are logged.
														</p>
													</div>
												</div>
											{:else if filteredBorrowers.length === 0}
												<div
													class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
												>
													<div class="max-w-sm">
														<div
															class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
														>
															<Search size={32} class="text-pink-600" />
														</div>
														<h4 class="mt-6 text-base font-semibold text-gray-900">
															No matches found
														</h4>
														<p class="mt-2 text-sm leading-6 text-gray-600">
															Try a different student name or email.
														</p>
													</div>
												</div>
											{:else}
												<div class="space-y-2 overflow-y-auto p-3">
													{#each paginatedBorrowers as borrower}
														<button type="button" onclick={() => (borrowDetail = { kind: 'borrower', subject: borrower })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
															<p class="text-sm font-medium text-gray-900">
																{borrower.studentName}
															</p>
															<p class="text-xs text-gray-600">{borrower.studentEmail}</p>
															<div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
																<span>{borrower.requestCount} requests</span>
																<span>&middot;</span>
																<span>{borrower.totalItems} items</span>
															</div>
														</button>
													{/each}
												</div>
												{#if borrowersTotalPages > 1}
													<div
														class="mt-auto flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2"
													>
														<p class="text-xs text-gray-600">
															Showing {(borrowersPage - 1) * INVENTORY_PAGE_SIZE + 1}-{Math.min(
																borrowersPage * INVENTORY_PAGE_SIZE,
																filteredBorrowers.length
															)} of {filteredBorrowers.length} borrowers
														</p>
														<div class="flex items-center gap-1.5">
															<button
																type="button"
																onclick={() => (borrowersPage = Math.max(1, borrowersPage - 1))}
																disabled={borrowersPage === 1}
																class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
																aria-label="Previous borrowers page"
															>
																<svg
																	class="h-4 w-4"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																>
																	<path
																		fill-rule="evenodd"
																		d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
															<nav
																class="isolate inline-flex items-center gap-1"
																aria-label="Borrowers pagination"
															>
																{#each borrowersPageTokens as token}
																	{#if token === 'ellipsis'}
																		<span
																			class="inline-flex h-8 min-w-8 items-center justify-center px-1 text-xs font-medium text-gray-500"
																			>...</span
																		>
																	{:else}
																		<button
																			type="button"
																			onclick={() => (borrowersPage = token)}
																			class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold {borrowersPage ===
																			token
																				? 'bg-pink-600 text-white shadow-sm'
																				: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}"
																		>
																			{token}
																		</button>
																	{/if}
																{/each}
															</nav>
															<button
																type="button"
																onclick={() =>
																	(borrowersPage = Math.min(
																		borrowersTotalPages,
																		borrowersPage + 1
																	))}
																disabled={borrowersPage === borrowersTotalPages}
																class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
																aria-label="Next borrowers page"
															>
																<svg
																	class="h-4 w-4"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																>
																	<path
																		fill-rule="evenodd"
																		d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
														</div>
													</div>
												{/if}
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}

					{#if activeTab === 'inventory'}
						<div data-tab-panel="inventory">
							<InventoryVarianceReport refreshKey={report?.meta?.generatedAt ?? null} userName={exportUserName} />

							<div class="mt-6 space-y-6">
								<StockAdjustmentsTable adjustments={report.inventory.stockAdjustments} />
								<DonorContributionsTable donations={report.inventory.donationRecords} />
							</div>
						</div>
					{/if}

					{#if activeTab === 'students'}
						<div data-tab-panel="students">
							<div class="space-y-6">
								<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
									<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
										<div>
											<h3 class="text-lg font-semibold text-gray-900">Student Risk Overview</h3>
											<p class="mt-1 text-sm text-gray-600">Selected range: {formatRangeLabel()}</p>
										</div>
										<p class="text-xs text-gray-500">
											Trust score visibility for all tracked students
										</p>
									</div>

									{#if studentTrustScores.length === 0}
										<div
											class="mt-4 flex min-h-55 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
										>
											<div class="max-w-sm">
												<div
													class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
												>
													<Users size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">
													No student risk data
												</h4>
												<p class="mt-2 text-sm leading-6 text-gray-600">
													Summary metrics will appear here once student activity exists in the
													selected range.
												</p>
											</div>
										</div>
									{:else}
										<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
											<div
												class="rounded-xl border border-gray-200 bg-gray-50 p-4 {DETAIL_HOVER}"
												{...opensDetail(
													() => studentsDetail('Students', 'Every student with a trust score in this period', studentTrustScores, trustLine),
													'View all students'
												)}
											>
												<p class="text-sm text-gray-600">Students</p>
												<p class="mt-2 text-2xl font-bold text-gray-900">
													{numberFmt.format(studentTrustScores.length)}
												</p>
											</div>
											<div
												class="rounded-xl border border-gray-200 bg-gray-50 p-4 {DETAIL_HOVER}"
												{...opensDetail(
													() =>
														studentsDetail(
															'Average Trust Score',
															'Every student score that makes up the average, highest first',
															[...studentTrustScores].sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0)),
															(s) => ({ right: String(Math.round(s.trustScore ?? 0)), ...trustLine(s) })
														),
													'View the scores behind the average trust score'
												)}
											>
												<p class="text-sm text-gray-600">Average Trust Score</p>
												<p class="mt-2 text-2xl font-bold text-pink-700">{averageTrustScore}</p>
											</div>
											<div
												class="rounded-xl border border-gray-200 bg-gray-50 p-4 {DETAIL_HOVER}"
												{...opensDetail(
													() =>
														studentsDetail(
															'High Incident Students',
															'Students with the most damaged or missing items',
															report?.studentRisk.highIncidentStudents ?? [],
															(s) => ({
																right: String(s.incidents ?? 0),
																meta: `${s.damagedCount ?? 0} damaged · ${s.missingCount ?? 0} missing`
															})
														),
													'View high incident students'
												)}
											>
												<p class="text-sm text-gray-600">High Incident Students</p>
												<p class="mt-2 text-2xl font-bold text-amber-700">
													{numberFmt.format(report.studentRisk.highIncidentStudents.length)}
												</p>
											</div>
										</div>
									{/if}
								</div>

								<StudentIncidentHistory
									classCodeIds={selectedClassCodeId ? [selectedClassCodeId] : []}
									range={selectedRange}
									rangeLabel={formatRangeLabel()}
									refreshKey={report?.meta?.generatedAt ?? null}
									userName={exportUserName}
								/>
								<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
									<div class="flex items-center justify-between gap-4">
										<div>
											<h3 class="text-lg font-semibold text-gray-900">Student Trust Scores</h3>
											<p class="mt-1 text-xs text-gray-600">
												Sorted from highest risk to strongest standing
											</p>
										</div>
										<p class="text-xs text-gray-500">
											{filteredStudentTrustScores.length} of {studentTrustScores.length} students
										</p>
									</div>

									<div class="mt-3">
										<label
											for="student-trust-search"
											class="mb-1 block text-xs font-medium text-gray-600">Search students</label
										>
										<div class="relative max-w-md">
											<Search
												size={16}
												class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
											/>
											<input
												id="student-trust-search"
												type="text"
												bind:value={studentTrustQuery}
												placeholder="Search by student name, email, or trust tier"
												class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 focus:outline-none"
											/>
											{#if studentTrustQuery}
												<button
													type="button"
													onclick={() => (studentTrustQuery = '')}
													class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
													aria-label="Clear student trust search"
												>
													<X size={14} />
												</button>
											{/if}
										</div>
									</div>

									<div class="mt-4 flex min-h-80 flex-col rounded-lg border border-gray-200">
										{#if studentTrustScores.length === 0}
											<div
												class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
											>
												<div class="max-w-sm">
													<div
														class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
													>
														<Users size={32} class="text-pink-600" />
													</div>
													<h4 class="mt-6 text-base font-semibold text-gray-900">
														No trust score data
													</h4>
													<p class="mt-2 text-sm leading-6 text-gray-600">
														Student trust scores will appear here once activity exists in the
														selected date range.
													</p>
												</div>
											</div>
										{:else if filteredStudentTrustScores.length === 0}
											<div
												class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
											>
												<div class="max-w-sm">
													<div
														class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100"
													>
														<Search size={32} class="text-pink-600" />
													</div>
													<h4 class="mt-6 text-base font-semibold text-gray-900">
														No matches found
													</h4>
													<p class="mt-2 text-sm leading-6 text-gray-600">
														Try a different student name, email, or trust tier keyword.
													</p>
												</div>
											</div>
										{:else}
											<div class="space-y-2 overflow-y-auto p-3">
												{#each paginatedStudentTrustScores as student}
													<button type="button" onclick={() => (studentDetail = student)} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
														<div class="flex items-start justify-between gap-4">
															<div class="min-w-0 flex-1">
																<div class="flex flex-wrap items-center gap-2">
																	<p class="truncate text-sm font-semibold text-gray-900">
																		{student.studentName || 'Unknown Student'}
																	</p>
																	<span
																		class="inline-flex rounded-full px-2 py-1 text-xs font-medium {getTrustTierClasses(
																			student.trustTier
																		)}">{student.trustTierLabel || 'Unrated'}</span
																	>
																</div>
																<p class="text-xs text-gray-600">{student.studentEmail || 'N/A'}</p>
																<div class="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
																	<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200"
																		>Requests {student.requestsTotal ?? 0}</span
																	>
																	<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200"
																		>Returned {student.requestsReturned ?? 0}</span
																	>
																	<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200"
																		>Obligations {student.activeObligations ?? 0}</span
																	>
																</div>
															</div>
															<div class="w-28 shrink-0 text-right">
																<p
																	class="text-2xl font-bold {getTrustScoreTextClass(
																		student.trustTier
																	)}"
																>
																	{Math.round(student.trustScore ?? 0)}
																</p>
																<p
																	class="text-[11px] font-medium tracking-wide text-gray-500 uppercase"
																>
																	Trust Score
																</p>
															</div>
														</div>
														<div class="mt-3 h-2 rounded-full bg-gray-200">
															<div
																class="h-2 rounded-full {getTrustBarClasses(student.trustScore)}"
																style={`width: ${Math.max(0, Math.min(100, student.trustScore ?? 0))}%`}
															></div>
														</div>
													</button>
												{/each}
											</div>
											{#if studentTrustTotalPages > 1}
												<div
													class="mt-auto flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2"
												>
													<p class="text-xs text-gray-600">
														Showing {(studentTrustPage - 1) * INVENTORY_PAGE_SIZE + 1}-{Math.min(
															studentTrustPage * INVENTORY_PAGE_SIZE,
															filteredStudentTrustScores.length
														)} of {filteredStudentTrustScores.length} students
													</p>
													<div class="flex items-center gap-1.5">
														<button
															type="button"
															onclick={() => (studentTrustPage = Math.max(1, studentTrustPage - 1))}
															disabled={studentTrustPage === 1}
															class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
															aria-label="Previous student trust page"
														>
															<svg
																class="h-4 w-4"
																viewBox="0 0 20 20"
																fill="currentColor"
																aria-hidden="true"
															>
																<path
																	fill-rule="evenodd"
																	d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
																	clip-rule="evenodd"
																/>
															</svg>
														</button>
														<nav
															class="isolate inline-flex items-center gap-1"
															aria-label="Student trust pagination"
														>
															{#each studentTrustPageTokens as token}
																{#if token === 'ellipsis'}
																	<span
																		class="inline-flex h-8 min-w-8 items-center justify-center px-1 text-xs font-medium text-gray-500"
																		>...</span
																	>
																{:else}
																	<button
																		type="button"
																		onclick={() => (studentTrustPage = token)}
																		class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold {studentTrustPage ===
																		token
																			? 'bg-pink-600 text-white shadow-sm'
																			: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}"
																	>
																		{token}
																	</button>
																{/if}
															{/each}
														</nav>
														<button
															type="button"
															onclick={() =>
																(studentTrustPage = Math.min(
																	studentTrustTotalPages,
																	studentTrustPage + 1
																))}
															disabled={studentTrustPage === studentTrustTotalPages}
															class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
															aria-label="Next student trust page"
														>
															<svg
																class="h-4 w-4"
																viewBox="0 0 20 20"
																fill="currentColor"
																aria-hidden="true"
															>
																<path
																	fill-rule="evenodd"
																	d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
																	clip-rule="evenodd"
																/>
															</svg>
														</button>
													</div>
												</div>
											{/if}
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>

	<BorrowingDetailModal
		open={!!borrowDetail}
		kind={borrowDetail?.kind}
		subject={borrowDetail?.subject ?? null}
		entries={report?.borrowRequests?.itemEntries ?? []}
		onClose={() => (borrowDetail = null)}
	/>
	<StudentRiskDetailModal
		open={!!studentDetail}
		student={studentDetail}
		entries={report?.borrowRequests?.itemEntries ?? []}
		onClose={() => (studentDetail = null)}
	/>
	<ReportDetailModal />
	<StockAdjustmentDetailModal
		open={!!adjDetail}
		adj={adjDetail}
		onClose={() => (adjDetail = null)}
	/>
	<AnalyticsExportModal
		open={showExportModal}
		onClose={() => (showExportModal = false)}
		{exporting}
		currentRangeLabel={formatRangeLabel()}
		classes={classOptions}
		students={studentOptions}
		instructors={instructorOptions}
		custodians={custodianOptions}
		walkInPeople={walkInPeopleOptions}
		defaultClassId={selectedClassCodeId}
		defaultStudentId={selectedStudentId}
		defaultInstructorId={selectedInstructorId}
		defaultCustodianId={selectedCustodianId}
		sections={EXPORT_SECTIONS}
		onGenerate={handleGenerate}
	/>
</div>
