<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { fetchAnalytics, peekCachedAnalytics, type AnalyticsReport } from '$lib/api/analyticsReports';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { confirmStore } from '$lib/stores/confirm';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		Package, ClipboardList, TriangleAlert, Clock,
		CheckCircle2, ArrowRight, TrendingUp, Users,
		ShieldAlert, PackageOpen,
		ChevronRight,
		AlertCircle
	} from 'lucide-svelte';

	// ── state ─────────────────────────────────────────────────────────────────
	function getMonthRange() {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
		const to = new Date().toISOString().slice(0, 10);
		return { from, to };
	}

	const _initialMonthRange = getMonthRange();
	const initialReport = browser ? peekCachedAnalytics({ period: 'month', from: _initialMonthRange.from, to: _initialMonthRange.to }) : null;
	const initialRequests = browser ? borrowRequestsAPI.peekCachedList({ statuses: ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return'], limit: 50 }) : null;
	let loading = $state(!initialReport);
	let cardsLoading = $state(!initialReport);
	let requestsNeedingActionLoading = $state(!initialRequests);
	let threeColBreakdownLoading = $state(!initialReport);
	let bottomTwoColLoading = $state(!initialReport);
	let highestIncidentLoading = $state(!initialReport);
	let report = $state<AnalyticsReport | null>(initialReport);
	let attemptedInventoryRefresh = false;

	$effect(() => {
		if (!report) return;
		const variance = report.inventory?.eomVariance ?? [];
		if (variance.length === 0 && !attemptedInventoryRefresh) {
			attemptedInventoryRefresh = true;
			(async () => {
				const { from, to } = getMonthRange();
				try {
					const fresh = await fetchAnalytics({ period: 'month', from, to, forceRefresh: true });
					if (fresh) report = fresh;
				} catch (err) {
					console.warn('[Custodian Dashboard] Inventory variance refresh failed:', err);
				}
			})();
		}
	});
	let liveRequests = $state<BorrowRequestRecord[]>(initialRequests ? initialRequests.requests : []);
	let requestsLoading = $state(!initialRequests);
	let currentTime = $state(new Date());

	// ── greeting ──────────────────────────────────────────────────────────────
	const greeting = $derived.by(() => {
		const h = currentTime.getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	});

	// ── derived KPIs ──────────────────────────────────────────────────────────
	const currentlyBorrowedCount = $derived(
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'borrowed')?.count ?? 0) +
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'pending_return')?.count ?? 0)
	);
	const overdueCount  = $derived(report?.borrowRequests.overdueCount ?? 0);
	const pendingCount  = $derived(
		report?.borrowRequests.statusBreakdown.find(s => s.status === 'approved_instructor')?.count ?? 0
	);
	const stockAlertCount   = $derived(report?.inventory.summary.lowStockCount ?? 0);
	const pendingObligations = $derived(report?.replacement.summary.pendingCount ?? 0);
	const totalItemsOut     = $derived(report?.inventory.itemsCurrentlyOut.reduce((s, i) => s + i.quantityOut, 0) ?? 0);

	// live request groups
	const requestsPendingApproval = $derived(
		liveRequests.filter(r => r.status === 'approved_instructor')
	);
	const requestsReadyPickup = $derived(
		liveRequests.filter(r => r.status === 'ready_for_pickup')
	);
	const requestsActive = $derived(
		liveRequests.filter(r => r.status === 'borrowed' || r.status === 'pending_return')
	);
	const requestsOverdue = $derived(
		requestsActive.filter(r => new Date(r.returnDate) < new Date())
	);
	const INVENTORY_VARIANCE_DISPLAY_LIMIT = 3;

	const inventoryVarianceItems = $derived(
		[...(report?.inventory.eomVariance ?? [])]
			.sort((a, b) => a.variance - b.variance)
			.slice(0, INVENTORY_VARIANCE_DISPLAY_LIMIT)
	);
	const negativeVarianceCount = $derived(
		report?.inventory.eomVariance.filter((item) => item.variance < 0).length ?? 0
	);
	const maxVarianceMagnitude = $derived(
		Math.max(1, ...(report?.inventory.eomVariance.map((item) => Math.abs(item.variance)) ?? [1]))
	);

	// bar chart max for most borrowed
	// Use analytics borrowRequests.itemsBorrowed (same as instructor) for Most Borrowed
	const topBorrowedItems = $derived((report?.borrowRequests?.itemsBorrowed ?? []).slice(0, 5));
	const topBorrowedMax = $derived(
		topBorrowedItems.length > 0
			? Math.max(...topBorrowedItems.map((item) => item.totalQuantity), 1)
			: 1
	);

// Damage rate display: prefer inventory.damageRateItems (server aggregation).
// If missing or empty, derive a fallback from lossAndDamage.tracking so the UI shows real incidents.
const damageRateDisplay = $derived.by(() => {
	if (report && report.inventory && (report.inventory.damageRateItems ?? []).length > 0) {
		return report.inventory.damageRateItems;
	}
	if (report && report.lossAndDamage && Array.isArray(report.lossAndDamage.tracking) && report.lossAndDamage.tracking.length > 0) {
		const map = new Map();
		for (const t of report.lossAndDamage.tracking) {
			const key = `${t.itemName}||${t.itemCategory}`;
			const cur = map.get(key) ?? { id: '', name: t.itemName, category: t.itemCategory, totalInspected: 0, damaged: 0, missing: 0 };
			// We don't have inspection counts here; use incident occurrences as inspected proxy.
			cur.totalInspected = (cur.totalInspected ?? 0) + 1;
			if (t.type === 'damaged') cur.damaged = (cur.damaged ?? 0) + 1;
			if (t.type === 'missing') cur.missing = (cur.missing ?? 0) + 1;
			cur.incidentRate = Math.round(((cur.damaged + cur.missing) / Math.max(cur.totalInspected, 1)) * 100);
			map.set(key, cur);
		}
		return Array.from(map.values()).sort((a, b) => (b.incidentRate ?? 0) - (a.incidentRate ?? 0));
	}
	return [];
});

	const REQUEST_STATUS_ROWS = [
		{ key: 'approved_instructor', label: 'Approved' },
		{ key: 'ready_for_pickup', label: 'Ready for Pickup' },
		{ key: 'borrowed', label: 'Borrowed' },
		{ key: 'pending_return', label: 'Pending Return' }
	] as const;

	const REQUEST_STATUS_BADGE_CLASS: Record<string, string> = {
		pending_instructor: 'bg-yellow-100 text-yellow-800',
		approved_instructor: 'bg-blue-100 text-blue-800',
		ready_for_pickup: 'bg-indigo-100 text-indigo-800',
		borrowed: 'bg-violet-100 text-violet-800',
		pending_return: 'bg-orange-100 text-orange-800',
		returned: 'bg-emerald-100 text-emerald-800',
		missing: 'bg-red-100 text-red-800',
		resolved: 'bg-teal-100 text-teal-800',
		cancelled: 'bg-gray-100 text-gray-600',
		rejected: 'bg-rose-100 text-rose-800'
	};

	const requestBreakdownRows = $derived.by(() => {
		const counts = new Map((report?.borrowRequests.statusBreakdown ?? []).map((item) => [item.status, item.count]));
		return REQUEST_STATUS_ROWS.map((row) => ({
			...row,
			count: counts.get(row.key) ?? 0
		}));
	});

	// ── helpers ───────────────────────────────────────────────────────────────
	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (!parts.length) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	// ── lifecycle ─────────────────────────────────────────────────────────────
	async function loadDashboard(force = false) {
		const hasCache = !!report && liveRequests.length > 0;

		try {
			// 1. cards (loaded from fetchAnalytics)
			if (force || !hasCache) {
				cardsLoading = true;
			}
			const { from, to } = getMonthRange();
			const cardsResult = await Promise.allSettled([
				fetchAnalytics({ period: 'month', from, to, forceRefresh: force })
			]);
			if (cardsResult[0].status === 'fulfilled') {
				report = cardsResult[0].value;
			}
			cardsLoading = false;

			// 2. Requests Needing Action (loaded from borrowRequestsAPI.list)
			if (force || !hasCache) {
				requestsNeedingActionLoading = true;
			}
			const requestsResult = await Promise.allSettled([
				borrowRequestsAPI.list(
					{ statuses: ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return'], limit: 50 },
					{ forceRefresh: force }
				)
			]);
			if (requestsResult[0].status === 'fulfilled') {
				liveRequests = requestsResult[0].value.requests;
			}
			requestsNeedingActionLoading = false;

			// 3. Request Breakdown, Inventory Variance, and Student Risk (loaded from fetchAnalytics)
			if (force || !hasCache) {
				threeColBreakdownLoading = true;
			}
			const threeColResult = await Promise.allSettled([
				fetchAnalytics({ period: 'month', from, to, forceRefresh: force })
			]);
			if (threeColResult[0].status === 'fulfilled') {
				report = threeColResult[0].value;
			}
			threeColBreakdownLoading = false;

			// 5. Most Borrowed This Month and Items Currently Out (loaded from fetchAnalytics)
			if (force || !hasCache) {
				bottomTwoColLoading = true;
			}
			const bottomTwoColResult = await Promise.allSettled([
				fetchAnalytics({ period: 'month', from, to, forceRefresh: force })
			]);
			if (bottomTwoColResult[0].status === 'fulfilled') {
				report = bottomTwoColResult[0].value;
			}
			bottomTwoColLoading = false;

			// 6. Items with Highest Incident Rate (loaded from fetchAnalytics)
			if (force || !hasCache) {
				highestIncidentLoading = true;
			}
			const highestIncidentResult = await Promise.allSettled([
				fetchAnalytics({ period: 'month', from, to, forceRefresh: force })
			]);
			if (highestIncidentResult[0].status === 'fulfilled') {
				report = highestIncidentResult[0].value;
			}
			highestIncidentLoading = false;

		} catch (err) {
			console.error('[Custodian Dashboard] Failed to load:', err);
			toastStore.error('Failed to load dashboard data.', 'Error');
		} finally {
			cardsLoading = false;
			requestsNeedingActionLoading = false;
			threeColBreakdownLoading = false;
			bottomTwoColLoading = false;
			highestIncidentLoading = false;
			loading = false;
			requestsLoading = false;
		}
	}

	async function loadRequests(force = false) {
		await loadDashboard(force);
	}

	function studentName(r: BorrowRequestRecord): string {
		return r.student?.fullName ?? `Student ${r.studentId.slice(-6).toUpperCase()}`;
	}

	function studentInitials(r: BorrowRequestRecord): string {
		return getInitials(studentName(r));
	}

	function daysOverdue(r: BorrowRequestRecord): number {
		return Math.ceil((Date.now() - new Date(r.returnDate).getTime()) / 86_400_000);
	}

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function getRequestDeepLink(r: BorrowRequestRecord): string {
		const tab =
			r.status === 'pending_instructor'
				? 'pending'
				: r.status === 'approved_instructor'
					? 'pending'
					: r.status === 'ready_for_pickup'
						? 'ready'
						: 'active';

		const params = new URLSearchParams({ tab, requestId: r.id });
		if (r.status === 'borrowed' || r.status === 'pending_return') {
			params.set('filter', 'overdue');
		}

		return `/supervisor/requests?${params.toString()}`;
	}

	async function confirmPickup(rawId: string): Promise<void> {
		const ok = await confirmStore.confirm({
			title: 'Confirm Pickup',
			message: 'Confirm that the student has successfully picked up all released items?',
			type: 'warning',
			confirmText: 'Confirm Pickup',
			cancelText: 'Cancel'
		});
		if (!ok) return;
		try {
			await borrowRequestsAPI.pickup(rawId);
			await loadDashboard(true);
			toastStore.success('Pickup confirmed successfully.');
		} catch {
			toastStore.error('Failed to confirm pickup.');
		}
	}

	onMount(() => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			authStore.clearJustLoggedIn();
		}
		void loadDashboard();


		const id = setInterval(() => { currentTime = new Date(); }, 60_000);
		return () => clearInterval(id);
	});
</script>

<svelte:head><title>Dashboard - Supervisor</title></svelte:head>

<div class="space-y-6">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{greeting}, {$user?.firstName}</h1>
			<p class="mt-0.5 text-sm text-gray-500">Kitchen Laboratory — Operational Overview</p>
		</div>
	</div>

	{#if cardsLoading}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 animate-pulse">
			{#each Array(5) as _}
				<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-3">
					<Skeleton class="h-3 w-24" /><Skeleton class="h-8 w-14" /><Skeleton class="h-3 w-20" />
				</div>
			{/each}
		</div>
	{:else}
		<!-- ── KPI strip ───────────────────────────────────────────────────── -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">

			<button
				type="button"
				onclick={() => goto('/supervisor/requests?tab=active')}
				class="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm hover:shadow-md hover:border-violet-300/60 hover:bg-violet-100/30 transition-all duration-200 active:scale-98 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-violet-500/20"
			>
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
					<PackageOpen size={12} /> Currently Borrowed
				</div>
				<p class="mt-2 text-3xl font-bold text-violet-700">{currentlyBorrowedCount}</p>
				<p class="mt-0.5 text-xs text-violet-500">{totalItemsOut} items currently out</p>
			</button>

			<button
				type="button"
				onclick={() => goto('/supervisor/requests?tab=pending')}
				class="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm hover:shadow-md hover:border-amber-300/60 hover:bg-amber-100/30 transition-all duration-200 active:scale-98 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-amber-500/20"
			>
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
					<Clock size={12} /> Pending
				</div>
				<p class="mt-2 text-3xl font-bold text-amber-700">{pendingCount}</p>
				<p class="mt-0.5 text-xs text-amber-500">Awaiting action</p>
			</button>

			<button
				type="button"
				onclick={() => goto('/supervisor/requests?tab=active&filter=overdue')}
				class="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm hover:shadow-md hover:border-red-300/60 hover:bg-red-100/30 transition-all duration-200 active:scale-98 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-red-500/20"
			>
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-800">
					<TriangleAlert size={12} /> Overdue
				</div>
				<p class="mt-2 text-3xl font-bold text-red-700">{overdueCount}</p>
				<p class="mt-0.5 text-xs text-red-600">Past return date</p>
			</button>

			<button
				type="button"
				onclick={() => {}}
				class="rounded-xl border {pendingObligations > 0 ? 'border-rose-200 bg-rose-50 hover:border-rose-300/60 hover:bg-rose-100/30 focus:ring-rose-500/20' : 'border-gray-200 bg-gray-50 hover:border-gray-300/60 hover:bg-gray-100/30 focus:ring-gray-500/20'} p-4 shadow-sm transition-all duration-200 active:scale-98 cursor-pointer text-left focus:outline-none focus:ring-2"
			>
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {pendingObligations > 0 ? 'text-rose-700' : 'text-gray-600'}">
					<AlertCircle size={12} /> Replacements
				</div>
				<p class="mt-2 text-3xl font-bold {pendingObligations > 0 ? 'text-rose-700' : 'text-gray-700'}">{pendingObligations}</p>
				<p class="mt-0.5 text-xs {pendingObligations > 0 ? 'text-rose-500' : 'text-gray-500'}">Pending cases</p>
			</button>
		</div>
	{/if}

		<!-- ── Requests Needing Action ────────────────────────────────────── -->
		<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
			<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
				<div class="flex items-center gap-2">
					<ClipboardList size={16} class="text-pink-500" />
					<h2 class="text-sm font-semibold text-gray-900">Requests Needing Action</h2>
					{#if !requestsNeedingActionLoading}
						{@const total = requestsPendingApproval.length + requestsReadyPickup.length + requestsActive.length}
						{#if total > 0}
							<span class="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700">{total}</span>
						{/if}
					{/if}
				</div>
				<a href="/supervisor/requests" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					View all <ArrowRight size={13} />
				</a>
			</div>

			{#if requestsNeedingActionLoading}
				<div class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 animate-pulse">
					{#each Array(3) as _}
						<div class="space-y-3 rounded-xl border border-gray-100 p-4">
							<Skeleton class="h-4 w-32" />
							{#each Array(2) as _}
								<div class="flex items-center gap-3">
									<Skeleton variant="circle" class="h-8 w-8" />
									<div class="flex-1 space-y-1.5"><Skeleton class="h-3.5 w-28" /><Skeleton class="h-3 w-20" /></div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			{:else}
				<div class="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">

					<!-- Pending Approval (approved by instructor, waiting custodian release) -->
					<div class="p-4">
						<div class="mb-3 flex items-center justify-between">
							<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
							<Clock size={11} /> Pending — Ready for Pickup
							</span>
							<span class="text-xs font-bold text-amber-700">{requestsPendingApproval.length}</span>
						</div>
						{#if requestsPendingApproval.length === 0}
							<div class="flex min-h-29 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
								<Clock size={18} class="text-pink-600" />
								<p class="mt-2 text-xs font-medium text-gray-500">No pending requests</p>
							</div>
						{:else}
							<ul class="space-y-2 overflow-y-auto">
								{#each requestsPendingApproval.slice(0, 5) as req}
									<a href={getRequestDeepLink(req)} class="group flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5 hover:bg-amber-50 transition-colors">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-200 text-xs font-semibold text-amber-800">
											{#if req.student?.profilePhotoUrl}
												<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
											{:else}
												{studentInitials(req)}
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
											<p class="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''} · {formatDate(req.borrowDate)}</p>
										</div>
										<div class="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500">
											<ChevronRight size={14} />
										</div>
									</a>
								{/each}
								{#if requestsPendingApproval.length > 5}
									<p class="pt-1 text-center text-xs text-gray-400">+{requestsPendingApproval.length - 5} more</p>
								{/if}
							</ul>
						{/if}
					</div>

					<!-- Ready for Pickup (items prepared, waiting for student to collect) -->
					<div class="p-4">
						<div class="mb-3 flex items-center justify-between">
							<span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
								<PackageOpen size={11} /> Ready for Pickup
							</span>
							<span class="text-xs font-bold text-indigo-700">{requestsReadyPickup.length}</span>
						</div>
						{#if requestsReadyPickup.length === 0}
							<div class="flex min-h-29 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
								<PackageOpen size={18} class="text-pink-600" />
								<p class="mt-2 text-xs font-medium text-gray-500">No items ready for pickup</p>
							</div>
						{:else}
							<ul class="space-y-2 overflow-y-auto">
								{#each requestsReadyPickup.slice(0, 5) as req}
									<li>
										<a href={getRequestDeepLink(req)} class="group flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-200 text-xs font-semibold text-indigo-800">
											{#if req.student?.profilePhotoUrl}
												<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
											{:else}
												{studentInitials(req)}
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
											<p class="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''} · {formatDate(req.borrowDate)}</p>
										</div>
										<div class="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500">
											<ChevronRight size={14} />
										</div>
										</a>
									</li>
								{/each}
								{#if requestsReadyPickup.length > 5}
									<p class="pt-1 text-center text-xs text-gray-400">+{requestsReadyPickup.length - 5} more</p>
								{/if}
							</ul>
						{/if}
					</div>

					<!-- Currently Borrowed (overdue highlighted) -->
					<div class="p-4">
						<div class="mb-3 flex items-center justify-between">
							<span class="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
								<Package size={11} /> Currently Borrowed
							</span>
							<span class="text-xs font-bold text-violet-700">{requestsActive.length}</span>
						</div>
						{#if requestsActive.length === 0}
							<div class="flex min-h-29 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
								<Package size={18} class="text-pink-600" />
								<p class="mt-2 text-xs font-medium text-gray-500">No currently borrowed items</p>
							</div>
						{:else}
							<ul class="space-y-2 overflow-y-auto">
								{#each requestsActive.slice(0, 5) as req}
									{@const overdue = new Date(req.returnDate) < new Date()}
									{@const days = overdue ? daysOverdue(req) : null}
									<a href={getRequestDeepLink(req)} class="group flex items-center gap-3 rounded-lg border {overdue ? 'border-red-200 bg-red-50/50' : 'border-violet-100 bg-violet-50/50'} px-3 py-2.5 hover:{overdue ? 'bg-red-50' : 'bg-violet-50'} transition-colors">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full {overdue ? 'bg-red-200 text-red-800' : 'bg-violet-200 text-violet-800'} text-xs font-semibold">
											{#if req.student?.profilePhotoUrl}
												<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
											{:else}
												{studentInitials(req)}
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
											<p class="text-xs {overdue ? 'text-red-500 font-medium' : 'text-gray-400'}">
												{overdue ? `${days}d overdue` : `Due ${formatDate(req.returnDate)}`}
											</p>
										</div>
										{#if overdue}
											<span class="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">!</span>
										{/if}
										<div class="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500">
											<ChevronRight size={14} />
										</div>
										</a>
								{/each}
								{#if requestsActive.length > 5}
									<p class="pt-1 text-center text-xs text-gray-400">+{requestsActive.length - 5} more</p>
								{/if}
							</ul>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- ── 3-col: Requests breakdown + Inventory variance + Student risk -->
		{#if threeColBreakdownLoading}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-pulse">
				{#each Array(3) as _}
					<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-4">
						<Skeleton class="h-5 w-40" />
						<Skeleton class="h-8 w-20" />
						{#each Array(3) as _}
							<div class="flex justify-between items-center">
								<Skeleton class="h-4 w-28" />
								<Skeleton class="h-4 w-8" />
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">

			<!-- Borrow request status breakdown -->
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<ClipboardList size={16} class="text-pink-500" />
						<h2 class="text-sm font-semibold text-gray-900">Request Breakdown</h2>
					</div>
					<a href="/supervisor/requests" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Manage <ArrowRight size={13} />
					</a>
				</div>
				<div>
				{#if report}
					{@const total = requestBreakdownRows.reduce((sum, row) => sum + row.count, 0)}
					<p class="mb-3 text-3xl font-bold leading-none text-gray-900">{total}</p>
					<div class="space-y-4">
						{#each requestBreakdownRows as row}
							<div class="flex items-center justify-between py-0.5">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium {REQUEST_STATUS_BADGE_CLASS[row.key] ?? 'bg-gray-100 text-gray-600'}">
									{row.label}
								</span>
								<span class="text-base font-semibold text-gray-700">{row.count}</span>
							</div>
						{/each}
					</div>
					{#if total === 0}
						<p class="mt-3 text-sm text-gray-400">No requests recorded for this period.</p>
					{/if}
				{:else}
					<p class="mb-3 text-3xl font-bold leading-none text-gray-900">0</p>
					<div class="space-y-4">
						{#each REQUEST_STATUS_ROWS as row}
							<div class="flex items-center justify-between py-0.5">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium {REQUEST_STATUS_BADGE_CLASS[row.key] ?? 'bg-gray-100 text-gray-600'}">{row.label}</span>
								<span class="text-base font-semibold text-gray-700">0</span>
							</div>
						{/each}
					</div>
					<p class="mt-3 text-sm text-gray-400">No request data available.</p>
				{/if}
				</div>
			</div>

			<!-- Inventory variance -->
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Package size={16} class="text-violet-500" />
						<h2 class="text-sm font-semibold text-gray-900">Inventory Variance</h2>
					</div>
					<a href="/supervisor/analytics?tab=inventory" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Details <ArrowRight size={13} />
					</a>
				</div>
				<div>
				{#if report && inventoryVarianceItems.length > 0}
					<div class="mb-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
						<p class="text-xs font-medium text-gray-500">Top {INVENTORY_VARIANCE_DISPLAY_LIMIT} items below expected count</p>
						<span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">{negativeVarianceCount}</span>
					</div>
					<div class="space-y-3">
						{#each inventoryVarianceItems as item}
							{@const magnitude = Math.abs(item.variance)}
							{@const pct = Math.round((magnitude / maxVarianceMagnitude) * 100)}
							<div class="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
										<p class="text-xs text-gray-400">{item.category}</p>
									</div>
									<span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold {item.variance < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
										{item.variance > 0 ? '+' : ''}{item.variance}
									</span>
								</div>
								<div class="h-1.5 w-full rounded-full bg-gray-200">
									<div class="h-1.5 rounded-full {item.variance < 0 ? 'bg-rose-400' : 'bg-emerald-400'}" style="width:{pct}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="mb-3 h-3 w-full overflow-hidden rounded-full bg-gray-100"></div>
					<p class="mt-3 text-sm text-gray-400">No variance data available.</p>
				{/if}
				</div>
			</div>

			<!-- Student risk snapshot -->
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Users size={16} class="text-rose-500" />
						<h2 class="text-sm font-semibold text-gray-900">Student Risk</h2>
					</div>
					<a href="/supervisor/analytics?tab=students" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Full report <ArrowRight size={13} />
					</a>
				</div>
				{#if report}
					<div class="space-y-3">
						<!-- Repeat offenders -->
						<div class="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
							<p class="text-xs font-medium text-rose-700">High Risk Students</p>
							<p class="mt-0.5 text-2xl font-bold text-rose-700">{report.studentRisk.repeatOffenders.length}</p>
							{#if report.studentRisk.repeatOffenders.length > 0}
								<p class="mt-1 text-xs text-rose-500 truncate">
									{report.studentRisk.repeatOffenders.slice(0, 2).map(s => s.studentName.split(' ')[0]).join(', ')}
									{report.studentRisk.repeatOffenders.length > 2 ? ` +${report.studentRisk.repeatOffenders.length - 2} more` : ''}
								</p>
							{/if}
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div class="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2.5 text-center">
								<p class="text-xs font-medium text-orange-600">Overdue</p>
								<p class="text-xl font-bold text-orange-700">{report.studentRisk.overdueStudents.length}</p>
							</div>
							<div class="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-center">
								<p class="text-xs font-medium text-red-600">High Incidents</p>
								<p class="text-xl font-bold text-red-700">{report.studentRisk.highIncidentStudents.length}</p>
							</div>
						</div>
						<!-- Replacement cases -->
						<div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
							<p class="text-xs font-medium text-amber-700">Pending Replacements</p>
							<p class="mt-0.5 text-2xl font-bold text-amber-700">{report.replacement.summary.pendingCount}</p>
							<p class="mt-0.5 text-xs text-amber-500">Avg resolution: {report.replacement.avgResolutionDays > 0 ? `${report.replacement.avgResolutionDays}d` : '—'}</p>
						</div>
					</div>
				{:else}
					<p class="text-sm text-gray-400 italic">No data available.</p>
				{/if}
			</div>
		</div>
	{/if}

		<!-- ── Bottom 2-col: Most borrowed + Items currently out ──────────── -->
		{#if bottomTwoColLoading}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 animate-pulse">
				{#each Array(2) as _}
					<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-4">
						<div class="flex justify-between">
							<Skeleton class="h-5 w-40" />
							<Skeleton class="h-4 w-16" />
						</div>
						<div class="space-y-3">
							{#each Array(4) as _}
								<div class="flex items-center gap-4">
									<div class="flex-1 space-y-2">
										<Skeleton class="h-4 w-3/4" />
										<Skeleton class="h-3 w-1/2" />
									</div>
									<Skeleton class="h-4 w-12" />
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">

			<!-- Most borrowed items -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<TrendingUp size={16} class="text-pink-500" />
						<h2 class="text-sm font-semibold text-gray-900">Most Borrowed This Month</h2>
					</div>
					<a href="/supervisor/analytics" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Full report <ArrowRight size={13} />
					</a>
				</div>
				{#if !report || topBorrowedItems.length === 0}
					<div class="flex h-72 items-center justify-center">
						<div class="text-center">
							<TrendingUp size={28} class="mx-auto text-pink-600" />
							<p class="mt-3 text-sm text-gray-500">No borrow data for this period.</p>
						</div>
					</div>
				{:else}
					<div class="h-72 divide-y divide-gray-50 overflow-hidden px-5 py-2">
						{#each topBorrowedItems as item, idx}
							<div class="flex items-center gap-3 py-3">
								<span class="w-5 shrink-0 text-right text-xs font-bold text-gray-300">#{idx + 1}</span>
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between mb-1">
										<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
										<span class="ml-2 shrink-0 text-xs text-gray-500">{item.totalQuantity}</span>
									</div>
									<div class="h-1.5 w-full rounded-full bg-gray-100">
										<div class="h-1.5 rounded-full bg-pink-400 transition-all" style="width:{Math.round((item.totalQuantity / topBorrowedMax) * 100)}%"></div>
									</div>
									<p class="mt-0.5 text-xs text-gray-400">{item.category}</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Items currently out -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<PackageOpen size={16} class="text-violet-500" />
						<h2 class="text-sm font-semibold text-gray-900">Items Currently Out</h2>
					</div>
				</div>
				{#if !report || report.inventory.itemsCurrentlyOut.length === 0}
					<div class="flex h-72 items-center justify-center">
						<div class="text-center">
							<PackageOpen size={28} class="mx-auto text-pink-600" />
							<p class="mt-3 text-sm text-gray-500">No items currently out.</p>
						</div>
					</div>
				{:else}
					<ul class="h-72 divide-y divide-gray-50 overflow-hidden">
						{#each report.inventory.itemsCurrentlyOut.slice(0, 5) as item}
							{@const total = item.quantityOut + item.totalStock}
							{@const utilPct = total > 0 ? Math.round((item.quantityOut / total) * 100) : 0}
							<li class="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
								<div class="flex-1 min-w-0">
									<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
									<p class="text-xs text-gray-400">{item.category}</p>
								</div>
								<div class="flex shrink-0 items-center gap-3">
									<div class="flex items-center gap-1.5">
										<div class="h-1.5 w-16 rounded-full bg-gray-100">
											<div class="h-1.5 rounded-full bg-violet-400" style="width:{utilPct}%"></div>
										</div>
										<span class="text-xs text-gray-500">{utilPct}%</span>
									</div>
									<span class="text-xs font-semibold text-violet-700">{item.quantityOut} out</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}



</div>
