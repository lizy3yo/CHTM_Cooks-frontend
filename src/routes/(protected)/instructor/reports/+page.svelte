<script lang="ts">
	import { onMount } from 'svelte';
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
	import { get } from 'svelte/store';
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
		X
	} from 'lucide-svelte';

	import ProcessedTransactionsTab from '$lib/components/reports/ProcessedTransactionsTab.svelte';
	import StockAdjustmentsTable from '$lib/components/reports/StockAdjustmentsTable.svelte';
	import DonorContributionsTable from '$lib/components/reports/DonorContributionsTable.svelte';
	import BorrowingDetailModal from '$lib/components/reports/BorrowingDetailModal.svelte';
	import StudentRiskDetailModal from '$lib/components/reports/StudentRiskDetailModal.svelte';
	import StockAdjustmentDetailModal from '$lib/components/reports/StockAdjustmentDetailModal.svelte';
	import WalkInTransactionsTab from '$lib/components/reports/WalkInTransactionsTab.svelte';

	type Tab = 'overview' | 'borrowing' | 'inventory' | 'students' | 'processed' | 'walk-in';
	type DatePreset = 'today' | 'last7' | 'mtd' | 'custom';

	const initialTo = todayISO();
	const initialFrom = monthStartISO();
	const initialReport = browser
		? peekCachedAnalytics({ period: 'month', from: initialFrom, to: initialTo })
		: null;

	let report = $state<AnalyticsReport | null>(initialReport);
	let borrowDetail = $state<{ kind: 'item' | 'borrower'; subject: any } | null>(null);
	let adjDetail = $state<any | null>(null);
	let studentDetail = $state<any | null>(null);
	let summaryReport = $state<Partial<AnalyticsReport> | null>(null);
	// Walk-in transactions come from the shared analytics payload (all staff roles see them).
	const walkInSource = $derived(report?.walkIns ?? summaryReport?.walkIns ?? null);
	let loading = $state(!initialReport);
	let overviewLoading = $state(!initialReport);
	let borrowingLoading = $state(!initialReport);
	let lossDamageLoading = $state(!initialReport);
	let inventoryLoading = $state(!initialReport);
	let studentRiskLoading = $state(!initialReport);
	let error = $state<string | null>(null);
	let unsubscribeSSE: (() => void) | null = null;
	let hasMounted = false;
	let pendingLoadTimer: ReturnType<typeof setTimeout> | null = null;

	let activeTab = $state<Tab>('overview');
	let period = $state<AnalyticsPeriod>('month');
	let datePreset = $state<DatePreset>('mtd');
	let customFrom = $state(initialFrom);
	let customTo = $state(initialTo);
	let inventoryItemsQuery = $state('');
	let inventoryVarianceFilter = $state<'all' | 'over' | 'under'>('all');

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

	function todayISO(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function monthStartISO(): string {
		const d = new Date();
		return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
	}

	function formatRangeLabel(): string {
		if (datePreset === 'today') return 'Today';
		if (datePreset === 'last7') return 'Last 7 Days';
		if (datePreset === 'mtd') return 'Month-to-Date';
		if (customFrom && customTo) {
			const fromLabel = new Date(customFrom).toLocaleDateString();
			const toLabel = new Date(customTo).toLocaleDateString();
			return `${fromLabel} to ${toLabel}`;
		}
		return 'Custom Range';
	}

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

			// 2. Borrowing Analytics
			if (forceRefresh || !hasCache) {
				borrowingLoading = true;
			}
			const borrowingResult = await Promise.allSettled([
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
			if (borrowingResult[0].status === 'fulfilled') {
				report = borrowingResult[0].value;
			}
			borrowingLoading = false;

			// 3. Loss & Damage
			if (forceRefresh || !hasCache) {
				lossDamageLoading = true;
			}
			const lossDamageResult = await Promise.allSettled([
				fetchAnalytics({
					period,
					from: customFrom || undefined,
					to: customTo || undefined,
					classCodeId: selectedClassCodeId || undefined,
					instructorId: selectedInstructorId || undefined,
					studentId: selectedStudentId || undefined,
					custodianId: selectedCustodianId || undefined
				})
			]);
			if (lossDamageResult[0].status === 'fulfilled') {
				report = lossDamageResult[0].value;
			}
			lossDamageLoading = false;

			// 4. Inventory
			if (forceRefresh || !hasCache) {
				inventoryLoading = true;
			}
			const inventoryResult = await Promise.allSettled([
				fetchAnalytics({
					period,
					from: customFrom || undefined,
					to: customTo || undefined,
					classCodeId: selectedClassCodeId || undefined,
					instructorId: selectedInstructorId || undefined,
					studentId: selectedStudentId || undefined,
					custodianId: selectedCustodianId || undefined
				})
			]);
			if (inventoryResult[0].status === 'fulfilled') {
				report = inventoryResult[0].value;
			}
			inventoryLoading = false;

			// 5. Student Risk
			if (forceRefresh || !hasCache) {
				studentRiskLoading = true;
			}
			const studentRiskResult = await Promise.allSettled([
				fetchAnalytics({
					period,
					from: customFrom || undefined,
					to: customTo || undefined,
					classCodeId: selectedClassCodeId || undefined,
					instructorId: selectedInstructorId || undefined,
					studentId: selectedStudentId || undefined,
					custodianId: selectedCustodianId || undefined
				})
			]);
			if (studentRiskResult[0].status === 'fulfilled') {
				report = studentRiskResult[0].value;
			}
			studentRiskLoading = false;
		} catch (err) {
			console.error('[Reports] Sequential load failed:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
			toastStore.error(error, 'Analytics');
		} finally {
			overviewLoading = false;
			borrowingLoading = false;
			lossDamageLoading = false;
			inventoryLoading = false;
			studentRiskLoading = false;
			loading = false;
		}
	}

	const totalRequests = $derived(
		(report?.borrowRequests ?? summaryReport?.borrowRequests)?.statusBreakdown?.reduce((s, i) => s + i.count, 0) ?? 0
	);
	const returnedCount = $derived(
		(report?.borrowRequests ?? summaryReport?.borrowRequests)?.statusBreakdown?.find((s) => s.status === 'returned')?.count ?? 0
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

	const filteredInventoryVarianceRows = $derived.by(() => {
		let rows = inventoryVarianceRows.slice();
		if (inventoryVarianceFilter === 'over') rows = rows.filter((r) => r.variance > 0);
		else if (inventoryVarianceFilter === 'under') rows = rows.filter((r) => r.variance < 0);
		const q = inventoryItemsQuery.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((item) =>
			[
				item.name,
				item.category,
				String(item.quantity),
				String(item.eomCount),
				String(item.variance)
			].some((value) => value.toLowerCase().includes(q))
		);
	});

	const inventoryOverTotal = $derived(
		inventoryVarianceRows.reduce((sum, item) => (item.variance > 0 ? sum + item.variance : sum), 0)
	);
	const inventoryShortTotal = $derived(
		inventoryVarianceRows.reduce((sum, item) => (item.variance < 0 ? sum + item.variance : sum), 0)
	);
	const lossAndDamageSummary = $derived(
		(report?.lossAndDamage ?? summaryReport?.lossAndDamage)?.summary ?? {
			todayTotal: 0,
			todayMissing: 0,
			todayDamaged: 0,
			last7DaysTotal: 0,
			last7DaysMissing: 0,
			last7DaysDamaged: 0,
			mtdTotal: 0,
			mtdMissing: 0,
			mtdDamaged: 0,
			periodTotal: 0,
			periodMissing: 0,
			periodDamaged: 0
		}
	);

	const enrichedLossDamageTracking = $derived.by(() => {
		const rows = report?.lossAndDamage.tracking ?? [];
		return rows.map((item) => {
			const resolvedCandidates = [
				(item as any).resolvedDate,
				(item as any).resolvedAt,
				(item as any).resolutionDate,
				(item as any).resolvedOn,
				(item as any).closedAt,
				(item as any).resolution?.date
			];
			const resolvedStr = resolvedCandidates.find((v) => typeof v === 'string' && v && v.trim());
			let daysToResolve: number | undefined = undefined;
			if (resolvedStr && item.incidentDate) {
				const inc = new Date(item.incidentDate);
				const res = new Date(resolvedStr as string);
				if (!isNaN(inc.getTime()) && !isNaN(res.getTime())) {
					daysToResolve = Math.max(0, Math.ceil((res.getTime() - inc.getTime()) / 86_400_000));
				}
			}
			return { ...item, daysToResolve };
		});
	});
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
	const topBorrowedMax = $derived(
		topBorrowedOverview.length > 0
			? Math.max(...topBorrowedOverview.map((item) => item.totalQuantity), 1)
			: 1
	);
	const lossDamageTotal = $derived(
		lossAndDamageSummary.periodMissing + lossAndDamageSummary.periodDamaged
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

	const lossDamageDonutStyle = $derived.by(() => {
		if (lossDamageTotal === 0) return 'conic-gradient(#e5e7eb 0 360deg)';
		const missingPct = (lossAndDamageSummary.periodMissing / lossDamageTotal) * 100;
		return `conic-gradient(#f43f5e 0% ${missingPct}%, #f59e0b ${missingPct}% 100%)`;
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

		if (!initialReport) {
			void loadReport();
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

	// ─── Export ───────────────────────────────────────────────────────────

	let showExportModal = $state(false);
	let exportTimeframeMode = $state<'current' | 'custom'>('current');
	let exportCustomFrom = $state(initialFrom);
	let exportCustomTo = $state(initialTo);

	let exportSections = $state({
		overview: true,
		borrowing: true,
		'loss-damage': true,
		inventory: true,
		students: true
	});

	function toggleAllSections(val: boolean) {
		exportSections = {
			overview: val,
			borrowing: val,
			'loss-damage': val,
			inventory: val,
			students: val
		};
	}

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

</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 data-tour="instructor-reports-header" class="text-2xl font-bold text-gray-900 sm:text-3xl">Reports & Analytics</h1>
			<p class="mt-1 text-sm text-gray-500">
				Professional borrowing and inventory analytics
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

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4" data-tour="instructor-reports-filters">
		<div class="flex flex-wrap items-center gap-3">
			<span class="text-sm font-semibold text-gray-700">Date Range:</span>
			{#each [{ id: 'today', label: 'Today' }, { id: 'last7', label: 'Last 7 Days' }, { id: 'mtd', label: 'Month-to-Date' }, { id: 'custom', label: 'Custom' }] as option}
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

	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-4">
			<nav class="flex gap-4 overflow-x-auto" aria-label="Report tabs" data-tour="instructor-reports-tabs">
				{#each [{ id: 'overview', label: 'Overview', icon: BarChart3 }, { id: 'borrowing', label: 'Borrowing Analytics', icon: Package }, { id: 'inventory', label: 'Inventory', icon: Package }, { id: 'students', label: 'Student Risk', icon: Users }, { id: 'processed', label: 'Processed Transactions', icon: FileText }, { id: 'walk-in', label: 'Walk-in Transactions', icon: Users }] as tab}
					<button
						onclick={() => (activeTab = tab.id as Tab)}
						class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition {activeTab ===
						tab.id
							? 'border-pink-600 text-pink-600'
							: 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}"
					>
						<tab.icon size={16} />
						{tab.label}
					</button>
				{/each}
			</nav>
		</div>

		{#if (activeTab === 'overview' && overviewLoading) || (activeTab === 'borrowing' && borrowingLoading) || (activeTab === 'inventory' && inventoryLoading) || (activeTab === 'students' && studentRiskLoading)}
			<div class="p-6">
				<ReportsSkeletonLoader view={activeTab} />
			</div>
		{:else if error}
			<div class="px-6 py-12">
				<div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
					{error}
				</div>
			</div>
		{:else if activeTab === 'processed'}
			<div class="p-6">
				<ProcessedTransactionsTab />
			</div>
		{:else if activeTab === 'walk-in'}
			<WalkInTransactionsTab data={walkInSource} />
		{:else if (activeTab === 'overview' && summaryReport) || report}
			<div class="space-y-6 p-6">
				{#if activeTab === 'overview'}
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-tour="instructor-reports-stats">
						<div
							class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md sm:p-5"
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
							class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md sm:p-5"
						>
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-semibold text-gray-700">Return Rate</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">
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
							class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md sm:p-5"
						>
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-semibold text-gray-700">Overdue Items</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">
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
												class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
											>
												<div class="flex items-center gap-2">
													<span class="h-2.5 w-2.5 rounded-full" style={`background:${row.color}`}
													></span>
													<span class="text-sm font-medium text-gray-700 capitalize"
														>{row.status.replace(/_/g, ' ')}</span
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
											<h4 class="mt-6 text-base font-semibold text-gray-900">No borrowed items</h4>
											<p class="mt-2 text-sm leading-6 text-gray-600">
												Top borrowed item trends will appear here once requests are recorded in the
												selected range.
											</p>
										</div>
									</div>
								{:else}
									{#each topBorrowedOverview as item}
										<div>
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
											<div class="flex items-center gap-2">
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
											<div class="flex items-center gap-2">
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
				{/if}

				{#if report}
					{#if activeTab === 'borrowing'}
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
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Total Requests</p>
									<p class="mt-2 text-2xl font-bold text-gray-900">
										{numberFmt.format(borrowingAvg.totalRequests)}
									</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Avg Items / Request</p>
									<p class="mt-2 text-2xl font-bold text-pink-700">
										{borrowingAvg.avgItemsPerRequest.toFixed(1)}
									</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Avg Quantity / Request</p>
									<p class="mt-2 text-2xl font-bold text-purple-700">
										{borrowingAvg.avgQuantityPerRequest.toFixed(1)}
									</p>
								</div>
							</div>
						</div>

						<div class="grid gap-4 lg:grid-cols-2">
							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<h3 class="text-lg font-semibold text-gray-900">Borrowed Items</h3>
								<p class="mt-1 text-xs text-gray-600">
									{report.borrowRequests.itemsBorrowed.length} unique items in the selected range
								</p>
								<div class="mt-4 min-h-80">
									{#if report.borrowRequests.itemsBorrowed.length === 0}
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
													Borrowed items for the selected range will appear here once requests are
													recorded.
												</p>
											</div>
										</div>
									{:else}
										<div class="max-h-80 space-y-2 overflow-y-auto">
											{#each report.borrowRequests.itemsBorrowed as item}
												<button type="button" onclick={() => (borrowDetail = { kind: 'item', subject: item })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
													<div class="flex items-center justify-between">
														<div class="min-w-0 flex-1">
															<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
															<p class="text-xs text-gray-600">{item.category}</p>
														</div>
														<div class="ml-3 text-right">
															<p class="text-sm font-bold text-pink-600">{item.totalQuantity}</p>
															<p class="text-xs text-gray-500">{item.borrowCount} req</p>
														</div>
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>

							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<h3 class="text-lg font-semibold text-gray-900">Borrowers</h3>
								<p class="mt-1 text-xs text-gray-600">
									{report.borrowRequests.borrowers.length} students in the selected range
								</p>
								<div class="mt-4 min-h-80">
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
													Borrower records for the selected range will appear here once requests are
													logged.
												</p>
											</div>
										</div>
									{:else}
										<div class="max-h-80 space-y-2 overflow-y-auto">
											{#each report.borrowRequests.borrowers as borrower}
												<button type="button" onclick={() => (borrowDetail = { kind: 'borrower', subject: borrower })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
													<p class="text-sm font-medium text-gray-900">{borrower.studentName}</p>
													<p class="text-xs text-gray-600">{borrower.studentEmail}</p>
													<div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
														<span>{borrower.requestCount} requests</span>
														<span>•</span>
														<span>{borrower.totalItems} items</span>
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'inventory'}
					<div class="space-y-6">
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Inventory Analytics</h3>
									<p class="mt-1 text-sm text-gray-600">
										Selected range: {formatRangeLabel()} (scoped to inventory activity in this period)
									</p>
								</div>
								<p class="text-xs text-gray-500">
									{inventoryVarianceRows.length} items with variance or overage
								</p>
							</div>

							<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Current Count</p>
									<p class="mt-2 text-2xl font-bold text-gray-900">
										{numberFmt.format(inventorySummary.currentCount)}
									</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">EOM Count</p>
									<p class="mt-2 text-2xl font-bold text-gray-900">
										{numberFmt.format(inventorySummary.eomCount)}
									</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Over</p>
									<p
										class="mt-2 text-2xl font-bold {inventoryOverTotal > 0
											? 'text-emerald-700'
											: 'text-gray-900'}"
									>
										{inventoryOverTotal > 0 ? '+' : ''}{numberFmt.format(inventoryOverTotal)}
									</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Under</p>
									<p
										class="mt-2 text-2xl font-bold {inventoryShortTotal < 0
											? 'text-rose-700'
											: 'text-gray-900'}"
									>
										{numberFmt.format(inventoryShortTotal)}
									</p>
								</div>
							</div>
						</div>

						<div class="grid gap-4 lg:grid-cols-2">
							<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
								<div class="flex items-center justify-between gap-4">
									<div>
										<h3 class="text-lg font-semibold text-gray-900">Variance Items</h3>
										<p class="mt-1 text-xs text-gray-600">
											Items where current count differs from EOM count
										</p>
									</div>
									<p class="text-xs text-gray-500">{filteredInventoryVarianceRows.length} of {inventoryVarianceRows.length} items</p>
								</div>

								<div class="mt-3 flex items-center justify-between gap-3">
									<div class="flex items-center gap-2 text-xs text-gray-600">
										<span class="font-medium">Filter:</span>
										<div role="tablist" aria-label="Variance filter" class="inline-flex rounded-lg bg-gray-100 p-1">
											<button type="button" onclick={() => (inventoryVarianceFilter = 'all')} aria-pressed={inventoryVarianceFilter === 'all'} class="rounded-lg px-3 py-1 text-xs font-medium transition {inventoryVarianceFilter === 'all' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}">All</button>
											<button type="button" onclick={() => (inventoryVarianceFilter = 'over')} aria-pressed={inventoryVarianceFilter === 'over'} class="rounded-lg px-3 py-1 text-xs font-medium transition {inventoryVarianceFilter === 'over' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}">Over</button>
											<button type="button" onclick={() => (inventoryVarianceFilter = 'under')} aria-pressed={inventoryVarianceFilter === 'under'} class="rounded-lg px-3 py-1 text-xs font-medium transition {inventoryVarianceFilter === 'under' ? 'bg-white text-rose-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}">Under</button>
										</div>
									</div>
									<div class="text-xs text-gray-500">Showing {filteredInventoryVarianceRows.length} items</div>
								</div>

								<div class="mt-4 space-y-2">
									{#if inventoryVarianceRows.length === 0}
										<div
											class="flex min-h-70 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
										>
											<div>
												<div
													class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100"
												>
													<Package size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">
													No inventory variance
												</h4>
												<p class="mt-2 max-w-sm text-sm leading-6 text-gray-600">
													All tracked items are aligned with their EOM counts in the selected range.
												</p>
											</div>
										</div>
									{:else}
										<div class="max-h-104 space-y-2 overflow-y-auto pr-1">
											{#each filteredInventoryVarianceRows as item}
												<button type="button" onclick={() => (borrowDetail = { kind: 'item', subject: item })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
													<div class="flex items-start justify-between gap-4">
														<div class="min-w-0 flex-1">
															<p class="truncate text-sm font-semibold text-gray-900">
																{item.name}
															</p>
															<p class="text-xs text-gray-600">{item.category}</p>
															<div class="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
																<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200"
																	>Current {item.quantity}</span
																>
																<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200"
																	>EOM {item.eomCount}</span
																>
															</div>
														</div>
														<div class="text-right">
															<p
																class="text-lg font-bold {item.variance > 0
																	? 'text-emerald-700'
																	: 'text-rose-700'}"
															>
																{item.variance > 0 ? '+' : ''}{numberFmt.format(item.variance)}
															</p>
															<span
																class="inline-flex rounded-full px-2 py-1 text-xs font-medium {item.variance >
																0
																	? 'bg-emerald-100 text-emerald-700'
																	: 'bg-rose-100 text-rose-700'}"
															>
																{item.variance > 0 ? 'Over' : 'Short'}
															</span>
														</div>
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>

							<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
								<div class="flex items-center justify-between gap-4">
									<div>
										<h3 class="text-lg font-semibold text-gray-900">Related Requests</h3>
										<p class="mt-1 text-xs text-gray-600">
											Latest request linked to each variance item
										</p>
									</div>
									<p class="text-xs text-gray-500">{filteredInventoryVarianceRows.length} of {inventoryVarianceRows.length} records</p>
								</div>

								<div class="mt-4 space-y-2">
									{#if inventoryVarianceRows.length === 0}
										<div
											class="flex min-h-70 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center"
										>
											<div>
												<div
													class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100"
												>
													<Package size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">
													No request context
												</h4>
												<p class="mt-2 max-w-sm text-sm leading-6 text-gray-600">
													Request context will appear here once inventory items are linked to
													borrowing activity.
												</p>
											</div>
										</div>
									{:else}
										<div class="max-h-104 space-y-2 overflow-y-auto pr-1">
											{#each filteredInventoryVarianceRows as item}
												{@const driver = report.inventory.varianceDrivers.find(
													(row) => row.id === item._id
												)}
												<button type="button" onclick={() => (borrowDetail = { kind: 'item', subject: item })} class="w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-pink-300 hover:bg-pink-50/40">
													<div class="flex items-start justify-between gap-4">
														<div class="min-w-0 flex-1">
															<p class="truncate text-sm font-semibold text-gray-900">
																{driver?.latestRequestId
																	? `REQ-${driver.latestRequestId.slice(-6).toUpperCase()}`
																	: 'N/A'}
															</p>
															<p class="text-xs text-gray-600">
																{driver?.studentName || 'Unknown student'}
															</p>
															<p class="mt-2 text-xs text-gray-500">
																{driver?.latestRequestDate
																	? new Date(driver.latestRequestDate).toLocaleDateString('en-US', {
																			month: 'short',
																			day: 'numeric',
																			year: 'numeric'
																		})
																	: 'No request date'} · {driver?.latestRequestStatus || 'N/A'}
															</p>
														</div>
														<div class="text-right">
															<p class="text-sm font-medium text-gray-900">{item.name}</p>
															<p class="text-xs text-gray-600">
																{driver?.requestCount ?? 0} requests
															</p>
															<p class="mt-1 text-xs text-gray-500">
																{driver?.totalBorrowedQuantity ?? 0} total borrowed
															</p>
														</div>
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>

						<div class="mt-6 space-y-6">
								<StockAdjustmentsTable adjustments={report.inventory.stockAdjustments} />
								<DonorContributionsTable donations={report.inventory.donationRecords} />
							</div>
					</div>
				{/if}

				{#if activeTab === 'students'}
					<div class="space-y-6">
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Student Risk Overview</h3>
									<p class="mt-1 text-sm text-gray-600">Selected range: {formatRangeLabel()}</p>
								</div>
								<p class="text-xs text-gray-500">Trust score visibility for all tracked students</p>
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
										<h4 class="mt-6 text-base font-semibold text-gray-900">No student risk data</h4>
										<p class="mt-2 text-sm leading-6 text-gray-600">
											Summary metrics will appear here once student activity exists in the selected
											range.
										</p>
									</div>
								</div>
							{:else}
								<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
										<p class="text-sm text-gray-600">Students</p>
										<p class="mt-2 text-2xl font-bold text-gray-900">
											{numberFmt.format(studentTrustScores.length)}
										</p>
									</div>
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
										<p class="text-sm text-gray-600">Average Trust Score</p>
										<p class="mt-2 text-2xl font-bold text-pink-700">{averageTrustScore}</p>
									</div>
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
										<p class="text-sm text-gray-600">High Incident Students</p>
										<p class="mt-2 text-2xl font-bold text-amber-700">
											{numberFmt.format(report.studentRisk.highIncidentStudents.length)}
										</p>
									</div>
								</div>
							{/if}
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex items-center justify-between gap-4">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Student Trust Scores</h3>
									<p class="mt-1 text-xs text-gray-600">
										Sorted from highest risk to strongest standing
									</p>
								</div>
								<p class="text-xs text-gray-500">{studentTrustScores.length} students</p>
							</div>

							<div class="mt-4 space-y-2">
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
												Student trust scores will appear here once activity exists in the selected
												date range.
											</p>
										</div>
									</div>
								{:else}
									<div class="max-h-120 space-y-2 overflow-y-auto pr-1">
										{#each studentTrustScores as student}
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
															class="text-2xl font-bold {getTrustScoreTextClass(student.trustTier)}"
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
								{/if}
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
