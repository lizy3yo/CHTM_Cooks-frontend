<script lang="ts">
	/**
	 * Staff operations dashboard, shared by the admin and custodian roles.
	 *
	 * Two data sources, each with a clear scope:
	 *  - Live snapshot (`/api/dashboard/operations`): KPI cards, action queues and
	 *    the request pipeline. Not date-scoped — it is the storeroom right now.
	 *  - Monthly analytics: trend panels (most borrowed, variance, student risk),
	 *    labelled as month-to-date where the figure is period-based.
	 *
	 * Both revalidate when the server's change signature moves (any request,
	 * inventory, walk-in or replacement change) and when the tab regains focus.
	 * The signature is used rather than the raw request stream because the
	 * stream also fires on every reconnect, which would refetch the heavy
	 * analytics report in a loop.
	 */
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import {
		fetchAnalytics,
		peekCachedAnalytics,
		subscribeToAnalyticsChanges,
		type AnalyticsReport
	} from '$lib/api/analyticsReports';
	import {
		fetchOperationsOverview,
		peekCachedOperationsOverview,
		type OperationsOverview,
		type OperationsQueueItem
	} from '$lib/api/operationsDashboard';
	import { STATUS_LABELS } from '$lib/utils/statusDisplay';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		Package,
		ClipboardList,
		TriangleAlert,
		Clock,
		Hourglass,
		ArrowRight,
		TrendingUp,
		Users,
		PackageOpen,
		ChevronRight,
		AlertCircle,
		RefreshCw
	} from 'lucide-svelte';

	interface Props {
		/** Route prefix for the role, e.g. `/admin` or `/custodian`. */
		basePath: string;
		/** Prefix for onboarding-tour anchors, e.g. `admin` → `admin-dash-kpis`. */
		tourPrefix: string;
		/** The role's reports page, e.g. `/admin/analytics`. */
		analyticsHref: string;
		/** Where the Replacement Cases card leads. */
		replacementHref: string;
		/**
		 * Where Under Review requests can be viewed. Omit when the role's
		 * requests page has no Under Review tab; the card is then display-only.
		 */
		reviewHref?: string | null;
	}

	let { basePath, tourPrefix, analyticsHref, replacementHref, reviewHref = null }: Props = $props();

	interface QueueRowStyle {
		rowClass: string;
		avatarClass: string;
		detail: string;
		detailClass?: string;
		flag?: { text: string; class: string } | null;
	}

	// ── State ─────────────────────────────────────────────────────────────────
	/** Monthly analytics older than this are refetched in the background. */
	const ANALYTICS_MAX_AGE_MS = 60_000;
	const QUEUE_PREVIEW = 5;

	function getMonthRange() {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
		const to = now.toISOString().slice(0, 10);
		return { from, to };
	}

	const initialOverview = browser ? peekCachedOperationsOverview() : null;
	const initialReport = browser ? peekCachedAnalytics({ period: 'month', ...getMonthRange() }) : null;

	let overview = $state<OperationsOverview | null>(initialOverview);
	let report = $state<AnalyticsReport | null>(initialReport);
	let overviewLoading = $state(!initialOverview);
	let reportLoading = $state(!initialReport);
	let refreshing = $state(false);
	let overviewError = $state(false);
	let currentTime = $state(new Date());

	// ── Greeting ──────────────────────────────────────────────────────────────
	const greeting = $derived.by(() => {
		const h = currentTime.getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	});

	const lastUpdated = $derived(
		overview
			? new Date(overview.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
			: null
	);

	// ── Derived figures ───────────────────────────────────────────────────────
	const pipeline = $derived(overview?.pipeline);
	const currentlyOutCount = $derived((pipeline?.borrowed ?? 0) + (pipeline?.pendingReturn ?? 0));

	const PIPELINE_ROWS = [
		{ key: 'underReview', status: 'pending_instructor', badge: 'bg-yellow-100 text-yellow-800' },
		{ key: 'approved', status: 'approved_instructor', badge: 'bg-amber-100 text-amber-800' },
		{ key: 'readyForPickup', status: 'ready_for_pickup', badge: 'bg-indigo-100 text-indigo-800' },
		{ key: 'borrowed', status: 'borrowed', badge: 'bg-violet-100 text-violet-800' },
		{ key: 'pendingReturn', status: 'pending_return', badge: 'bg-orange-100 text-orange-800' },
		{ key: 'unresolved', status: 'missing', badge: 'bg-red-100 text-red-800' }
	] as const;

	const pipelineRows = $derived(
		PIPELINE_ROWS.map((row) => ({
			...row,
			label: STATUS_LABELS[row.status],
			count: pipeline?.[row.key] ?? 0
		}))
	);
	const pipelineTotal = $derived(pipelineRows.reduce((sum, row) => sum + row.count, 0));

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

	const topBorrowedItems = $derived((report?.borrowRequests?.itemsBorrowed ?? []).slice(0, 5));
	const topBorrowedMax = $derived(
		Math.max(1, ...topBorrowedItems.map((item) => item.totalQuantity))
	);

	// ── Links ─────────────────────────────────────────────────────────────────
	const requestsHref = $derived(`${basePath}/requests`);

	function queueItemHref(item: OperationsQueueItem): string | null {
		if (item.status === 'pending_instructor' || item.status === 'pending_appeal') {
			return reviewHref ? `${reviewHref}&requestId=${item.id}` : null;
		}
		const tab =
			item.status === 'approved_instructor'
				? 'pending'
				: item.status === 'ready_for_pickup'
					? 'ready'
					: 'active';
		const params = new URLSearchParams({ tab, requestId: item.id });
		if (item.isOverdue) params.set('filter', 'overdue');
		return `${requestsHref}?${params.toString()}`;
	}

	// ── Formatting ────────────────────────────────────────────────────────────
	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (!parts.length) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	function studentName(item: OperationsQueueItem): string {
		return item.studentName || `Student ${item.studentId.slice(-6).toUpperCase()}`;
	}

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function itemsLabel(n: number): string {
		return `${n} item${n === 1 ? '' : 's'}`;
	}

	function daysOverdue(item: OperationsQueueItem): number {
		if (!item.returnDate) return 0;
		return Math.max(1, Math.ceil((Date.now() - new Date(item.returnDate).getTime()) / 86_400_000));
	}

	// ── Data loading ──────────────────────────────────────────────────────────
	async function loadOverview(): Promise<void> {
		try {
			overview = await fetchOperationsOverview();
			overviewError = false;
		} catch (err) {
			console.error('[Operations Dashboard] Live snapshot failed:', err);
			// Keep showing the last good snapshot; only flag when there is none.
			if (!overview) overviewError = true;
		} finally {
			overviewLoading = false;
		}
	}

	async function loadReport(force: boolean): Promise<void> {
		try {
			report = await fetchAnalytics({ period: 'month', ...getMonthRange(), forceRefresh: force });
		} catch (err) {
			console.error('[Operations Dashboard] Monthly analytics failed:', err);
		} finally {
			reportLoading = false;
		}
	}

	function reportIsStale(): boolean {
		if (!report?.meta?.generatedAt) return true;
		return Date.now() - new Date(report.meta.generatedAt).getTime() > ANALYTICS_MAX_AGE_MS;
	}

	async function refreshAll(forceReport: boolean): Promise<void> {
		await Promise.all([loadOverview(), loadReport(forceReport)]);
	}

	async function manualRefresh(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		await refreshAll(true);
		refreshing = false;
		if (overviewError) toastStore.error('Failed to refresh dashboard data.', 'Error');
	}

	// A burst of changes (e.g. a bulk approval) should cost one refetch.
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleRefresh(): void {
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void refreshAll(true);
		}, 400);
	}

	onMount(() => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			authStore.clearJustLoggedIn();
		}

		// Stale-while-revalidate: cached data is already on screen; the live
		// snapshot is always refetched, monthly analytics only when stale.
		void loadOverview();
		void loadReport(reportIsStale());

		const unsubscribeChanges = subscribeToAnalyticsChanges(scheduleRefresh);

		const onVisible = () => {
			if (!document.hidden) void loadOverview();
		};
		document.addEventListener('visibilitychange', onVisible);

		const clock = setInterval(() => {
			currentTime = new Date();
		}, 60_000);

		return () => {
			unsubscribeChanges();
			document.removeEventListener('visibilitychange', onVisible);
			clearInterval(clock);
			if (refreshTimer) clearTimeout(refreshTimer);
		};
	});
</script>

{#snippet queueAvatar(item: OperationsQueueItem, tone: string)}
	<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold {tone}">
		{#if item.studentPhotoUrl}
			<img src={item.studentPhotoUrl} alt={studentName(item)} class="h-full w-full object-cover" />
		{:else}
			{getInitials(studentName(item))}
		{/if}
	</div>
{/snippet}

{#snippet queueRow(item: OperationsQueueItem, row: QueueRowStyle)}
	{@const href = queueItemHref(item)}
	<li>
		<svelte:element
			this={href ? 'a' : 'div'}
			href={href ?? undefined}
			class="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors {row.rowClass}"
		>
			{@render queueAvatar(item, row.avatarClass)}
			<div class="min-w-0 flex-1">
				<p class="truncate text-xs font-semibold text-gray-900">{studentName(item)}</p>
				<p class="truncate text-xs {row.detailClass ?? 'text-gray-400'}">{row.detail}</p>
			</div>
			{#if row.flag}
				<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide {row.flag.class}">{row.flag.text}</span>
			{/if}
			{#if href}
				<ChevronRight size={14} class="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500" />
			{/if}
		</svelte:element>
	</li>
{/snippet}

{#snippet queueFooter(total: number, href: string | null)}
	{#if total > QUEUE_PREVIEW}
		{#if href}
			<a href={href} class="block pt-1 text-center text-xs font-medium text-pink-600 hover:text-pink-700">
				+{total - QUEUE_PREVIEW} more
			</a>
		{:else}
			<p class="pt-1 text-center text-xs text-gray-400">+{total - QUEUE_PREVIEW} more</p>
		{/if}
	{/if}
{/snippet}

{#snippet emptyQueue(Icon: typeof Clock, message: string)}
	<div class="flex min-h-29 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
		<Icon size={18} class="text-pink-600" />
		<p class="mt-2 text-xs font-medium text-gray-500">{message}</p>
	</div>
{/snippet}

{#snippet monthTag()}
	<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">This month</span>
{/snippet}

<div class="space-y-6">
	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-3" data-tour="{tourPrefix}-dash-header">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{greeting}, {$user?.firstName}</h1>
			<p class="mt-0.5 text-sm text-gray-500">Kitchen Laboratory — Operational Overview</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if lastUpdated}
				<span class="hidden items-center gap-1.5 text-xs text-gray-500 sm:inline-flex" aria-live="polite">
					<span class="relative flex h-2 w-2">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
					</span>
					Live · Updated {lastUpdated}
				</span>
			{/if}
			<button
				type="button"
				onclick={manualRefresh}
				disabled={refreshing}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500/20 disabled:opacity-60"
				aria-label="Refresh dashboard"
			>
				<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} />
				<span class="hidden sm:inline">Refresh</span>
			</button>
		</div>
	</div>

	{#if overviewError}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			<AlertCircle size={16} class="shrink-0" />
			<span class="flex-1">Live figures could not be loaded. They will appear as soon as the server responds.</span>
			<button type="button" onclick={manualRefresh} class="font-semibold underline hover:no-underline">Retry</button>
		</div>
	{/if}

	<!-- ── KPI strip (live) ───────────────────────────────────────────────── -->
	{#if overviewLoading}
		<div class="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			{#each Array(5) as _}
				<div class="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
					<Skeleton class="h-3 w-24" /><Skeleton class="h-8 w-14" /><Skeleton class="h-3 w-20" />
				</div>
			{/each}
		</div>
	{:else}
		{@const kpiBase = 'rounded-xl border p-4 text-left shadow-sm transition-all duration-200 focus:outline-none focus:ring-2'}
		{@const kpiLink = 'cursor-pointer hover:shadow-md active:scale-98'}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-tour="{tourPrefix}-dash-kpis">
			<svelte:element
				this={reviewHref ? 'a' : 'div'}
				href={reviewHref ?? undefined}
				class="{kpiBase} {reviewHref ? kpiLink : ''} border-yellow-200 bg-yellow-50 focus:ring-yellow-500/20"
			>
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-yellow-800">
					<Hourglass size={12} /> Under Review
				</div>
				<p class="mt-2 text-3xl font-bold text-yellow-800">{pipeline?.underReview ?? 0}</p>
				<p class="mt-0.5 text-xs text-yellow-700">
					{pipeline?.appeals ? `Incl. ${pipeline.appeals} appeal${pipeline.appeals === 1 ? '' : 's'}` : 'Awaiting instructor'}
				</p>
			</svelte:element>

			<a href="{requestsHref}?tab=pending" class="{kpiBase} {kpiLink} border-amber-200 bg-amber-50 focus:ring-amber-500/20">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
					<Clock size={12} /> Awaiting Preparation
				</div>
				<p class="mt-2 text-3xl font-bold text-amber-700">{pipeline?.approved ?? 0}</p>
				<p class="mt-0.5 text-xs text-amber-600">Approved, to prepare</p>
			</a>

			<a href="{requestsHref}?tab=active" class="{kpiBase} {kpiLink} border-violet-200 bg-violet-50 focus:ring-violet-500/20">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
					<PackageOpen size={12} /> Currently Borrowed
				</div>
				<p class="mt-2 text-3xl font-bold text-violet-700">{currentlyOutCount}</p>
				<p class="mt-0.5 text-xs text-violet-500">{overview?.itemsOut ?? 0} items currently out</p>
			</a>

			<a href="{requestsHref}?tab=active&filter=overdue" class="{kpiBase} {kpiLink} border-red-200 bg-red-50 focus:ring-red-500/20">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-800">
					<TriangleAlert size={12} /> Overdue Returns
				</div>
				<p class="mt-2 text-3xl font-bold text-red-700">{pipeline?.overdue ?? 0}</p>
				<p class="mt-0.5 text-xs text-red-600">Past return date</p>
			</a>

			<a
				href={replacementHref}
				class="{kpiBase} {kpiLink} col-span-2 sm:col-span-1 {overview?.replacementsPending ? 'border-rose-200 bg-rose-50 focus:ring-rose-500/20' : 'border-gray-200 bg-gray-50 focus:ring-gray-500/20'}"
			>
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {overview?.replacementsPending ? 'text-rose-700' : 'text-gray-600'}">
					<AlertCircle size={12} /> Replacement Cases
				</div>
				<p class="mt-2 text-3xl font-bold {overview?.replacementsPending ? 'text-rose-700' : 'text-gray-700'}">{overview?.replacementsPending ?? 0}</p>
				<p class="mt-0.5 text-xs {overview?.replacementsPending ? 'text-rose-500' : 'text-gray-500'}">Pending cases</p>
			</a>
		</div>
	{/if}

	<!-- ── Requests needing action (live queues) ──────────────────────────── -->
	<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100" data-tour="{tourPrefix}-dash-actions">
		<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
			<div class="flex items-center gap-2">
				<ClipboardList size={16} class="text-pink-500" />
				<h2 class="text-sm font-semibold text-gray-900">Requests Needing Action</h2>
				{#if !overviewLoading && pipeline}
					{@const total = pipeline.underReview + pipeline.approved + pipeline.readyForPickup + currentlyOutCount}
					{#if total > 0}
						<span class="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700">{total}</span>
					{/if}
				{/if}
			</div>
			<a href={requestsHref} class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
				View all <ArrowRight size={13} />
			</a>
		</div>

		{#if overviewLoading}
			<div class="grid animate-pulse grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
				{#each Array(4) as _}
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
		{:else if overview}
			{@const q = overview.queues}
			<div class="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
				<!-- Under Review: awaiting the instructor's decision (view only) -->
				<div class="border-gray-100 p-4 sm:border-r sm:border-b xl:border-b-0">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
							<Hourglass size={11} /> Under Review
						</span>
						<span class="text-xs font-bold text-yellow-800">{overview.pipeline.underReview}</span>
					</div>
					{#if q.underReview.length === 0}
						{@render emptyQueue(Hourglass, 'Nothing awaiting review')}
					{:else}
						<ul class="space-y-2">
							{#each q.underReview as item (item.id)}
								{@render queueRow(item, {
									rowClass: 'border-yellow-100 bg-yellow-50/50 hover:bg-yellow-50',
									avatarClass: 'bg-yellow-200 text-yellow-800',
									detail: `${itemsLabel(item.itemCount)} · ${item.instructorName ? `Awaiting ${item.instructorName}` : 'Awaiting instructor'}`,
									flag: item.status === 'pending_appeal' ? { text: 'Appeal', class: 'bg-yellow-200 text-yellow-900' } : null
								})}
							{/each}
							{@render queueFooter(overview.pipeline.underReview, reviewHref)}
						</ul>
					{/if}
				</div>

				<!-- Awaiting Preparation: approved, custodian prepares the items -->
				<div class="border-gray-100 p-4 sm:border-b xl:border-b-0">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
							<Clock size={11} /> Awaiting Preparation
						</span>
						<span class="text-xs font-bold text-amber-700">{overview.pipeline.approved}</span>
					</div>
					{#if q.approved.length === 0}
						{@render emptyQueue(Clock, 'Nothing to prepare')}
					{:else}
						<ul class="space-y-2">
							{#each q.approved as item (item.id)}
								{@render queueRow(item, {
									rowClass: 'border-amber-100 bg-amber-50/50 hover:bg-amber-50',
									avatarClass: 'bg-amber-200 text-amber-800',
									detail: `${itemsLabel(item.itemCount)} · Pickup ${formatDate(item.borrowDate)}`
								})}
							{/each}
							{@render queueFooter(overview.pipeline.approved, `${requestsHref}?tab=pending`)}
						</ul>
					{/if}
				</div>

				<!-- Ready for Pickup: prepared, waiting for the student -->
				<div class="border-gray-100 p-4 sm:border-r">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
							<PackageOpen size={11} /> Ready for Pickup
						</span>
						<span class="text-xs font-bold text-indigo-700">{overview.pipeline.readyForPickup}</span>
					</div>
					{#if q.readyForPickup.length === 0}
						{@render emptyQueue(PackageOpen, 'No items ready for pickup')}
					{:else}
						<ul class="space-y-2">
							{#each q.readyForPickup as item (item.id)}
								{@render queueRow(item, {
									rowClass: 'border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50',
									avatarClass: 'bg-indigo-200 text-indigo-800',
									detail: `${itemsLabel(item.itemCount)} · Pickup ${formatDate(item.borrowDate)}`
								})}
							{/each}
							{@render queueFooter(overview.pipeline.readyForPickup, `${requestsHref}?tab=ready`)}
						</ul>
					{/if}
				</div>

				<!-- Currently Borrowed: earliest due first, so overdue leads -->
				<div class="p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
							<Package size={11} /> Currently Borrowed
						</span>
						<span class="text-xs font-bold text-violet-700">{currentlyOutCount}</span>
					</div>
					{#if q.borrowed.length === 0}
						{@render emptyQueue(Package, 'No items currently borrowed')}
					{:else}
						<ul class="space-y-2">
							{#each q.borrowed as item (item.id)}
								{@render queueRow(item, item.isOverdue
									? {
											rowClass: 'border-red-200 bg-red-50/50 hover:bg-red-50',
											avatarClass: 'bg-red-200 text-red-800',
											detail: `${daysOverdue(item)}d overdue`,
											detailClass: 'font-medium text-red-500',
											flag: { text: 'Late', class: 'bg-red-100 text-red-700' }
										}
									: {
											rowClass: 'border-violet-100 bg-violet-50/50 hover:bg-violet-50',
											avatarClass: 'bg-violet-200 text-violet-800',
											detail: item.status === 'pending_return' ? 'Awaiting return confirmation' : `Due ${formatDate(item.returnDate)}`,
											flag: item.status === 'pending_return' ? { text: 'Check-in', class: 'bg-orange-100 text-orange-700' } : null
										})}
							{/each}
							{@render queueFooter(currentlyOutCount, `${requestsHref}?tab=active`)}
						</ul>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- ── Pipeline (live) + variance + student risk ──────────────────────── -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3" data-tour="{tourPrefix}-dash-analytics">
		<!-- Live request pipeline -->
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<ClipboardList size={16} class="text-pink-500" />
					<h2 class="text-sm font-semibold text-gray-900">Live Request Pipeline</h2>
				</div>
				<a href={requestsHref} class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					Manage <ArrowRight size={13} />
				</a>
			</div>
			{#if overviewLoading}
				<div class="animate-pulse space-y-4">
					<Skeleton class="h-8 w-20" />
					{#each Array(6) as _}
						<div class="flex items-center justify-between"><Skeleton class="h-5 w-36" /><Skeleton class="h-4 w-8" /></div>
					{/each}
				</div>
			{:else}
				<div class="mb-3 flex items-baseline gap-2">
					<p class="text-3xl font-bold leading-none text-gray-900">{pipelineTotal}</p>
					<p class="text-xs text-gray-500">open requests</p>
				</div>
				<div class="space-y-3">
					{#each pipelineRows as row (row.key)}
						<div class="flex items-center justify-between py-0.5">
							<span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium {row.badge}">{row.label}</span>
							<span class="text-base font-semibold text-gray-700">{row.count}</span>
						</div>
					{/each}
				</div>
				{#if pipelineTotal === 0}
					<p class="mt-3 text-sm text-gray-400">No open requests right now.</p>
				{/if}
			{/if}
		</div>

		<!-- Inventory variance (current counts vs end-of-month count) -->
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Package size={16} class="text-violet-500" />
					<h2 class="text-sm font-semibold text-gray-900">Inventory Variance</h2>
				</div>
				<a href="{analyticsHref}?tab=inventory" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					Details <ArrowRight size={13} />
				</a>
			</div>
			{#if reportLoading}
				<div class="animate-pulse space-y-3">
					{#each Array(3) as _}<Skeleton class="h-14 w-full" />{/each}
				</div>
			{:else if inventoryVarianceItems.length > 0}
				<div class="mb-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
					<p class="text-xs font-medium text-gray-500">Items below expected count</p>
					<span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">{negativeVarianceCount}</span>
				</div>
				<div class="space-y-3">
					{#each inventoryVarianceItems as item}
						{@const pct = Math.round((Math.abs(item.variance) / maxVarianceMagnitude) * 100)}
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
				<p class="text-sm text-gray-400">No variance — every item matches its expected count.</p>
			{/if}
		</div>

		<!-- Student risk -->
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Users size={16} class="text-rose-500" />
					<h2 class="text-sm font-semibold text-gray-900">Student Risk</h2>
				</div>
				<a href="{analyticsHref}?tab=students" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					Full report <ArrowRight size={13} />
				</a>
			</div>
			{#if reportLoading}
				<div class="animate-pulse space-y-3"><Skeleton class="h-20 w-full" /><Skeleton class="h-14 w-full" /><Skeleton class="h-20 w-full" /></div>
			{:else if report}
				{@const risk = report.studentRisk}
				<div class="space-y-3">
					<div class="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
						<p class="text-xs font-medium text-rose-700">High Risk Students</p>
						<p class="mt-0.5 text-2xl font-bold text-rose-700">{risk.repeatOffenders.length}</p>
						{#if risk.repeatOffenders.length > 0}
							<p class="mt-1 truncate text-xs text-rose-500">
								{risk.repeatOffenders.slice(0, 2).map((s) => s.studentName.split(' ')[0]).join(', ')}
								{risk.repeatOffenders.length > 2 ? ` +${risk.repeatOffenders.length - 2} more` : ''}
							</p>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div class="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2.5 text-center">
							<p class="text-xs font-medium text-orange-600">Overdue Students</p>
							<p class="text-xl font-bold text-orange-700">{risk.overdueStudents.length}</p>
						</div>
						<div class="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-center">
							<p class="text-xs font-medium text-red-600">Incidents (Month)</p>
							<p class="text-xl font-bold text-red-700">{risk.highIncidentStudents.length}</p>
						</div>
					</div>
					<div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
						<p class="text-xs font-medium text-amber-700">Pending Replacements</p>
						<p class="mt-0.5 text-2xl font-bold text-amber-700">{overview?.replacementsPending ?? report.replacement.summary.pendingCount}</p>
						<p class="mt-0.5 text-xs text-amber-500">
							Avg resolution: {report.replacement.avgResolutionDays > 0 ? `${report.replacement.avgResolutionDays}d` : '—'}
						</p>
					</div>
				</div>
			{:else}
				<p class="text-sm italic text-gray-400">No data available.</p>
			{/if}
		</div>
	</div>

	<!-- ── Most borrowed (month) + items currently out (live) ─────────────── -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
			<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
				<div class="flex items-center gap-2">
					<TrendingUp size={16} class="text-pink-500" />
					<h2 class="text-sm font-semibold text-gray-900">Most Borrowed</h2>
					{@render monthTag()}
				</div>
				<a href={analyticsHref} class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					Full report <ArrowRight size={13} />
				</a>
			</div>
			{#if reportLoading}
				<div class="h-72 animate-pulse space-y-4 px-5 py-4">
					{#each Array(4) as _}<Skeleton class="h-10 w-full" />{/each}
				</div>
			{:else if topBorrowedItems.length === 0}
				<div class="flex h-72 items-center justify-center">
					<div class="text-center">
						<TrendingUp size={28} class="mx-auto text-pink-600" />
						<p class="mt-3 text-sm text-gray-500">No borrow data this month.</p>
					</div>
				</div>
			{:else}
				<div class="h-72 divide-y divide-gray-50 overflow-hidden px-5 py-2">
					{#each topBorrowedItems as item, idx}
						<div class="flex items-center gap-3 py-3">
							<span class="w-5 shrink-0 text-right text-xs font-bold text-gray-300">#{idx + 1}</span>
							<div class="min-w-0 flex-1">
								<div class="mb-1 flex items-center justify-between">
									<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
									<span class="ml-2 shrink-0 text-xs text-gray-500">{item.totalQuantity} units</span>
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

		<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
			<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
				<div class="flex items-center gap-2">
					<PackageOpen size={16} class="text-violet-500" />
					<h2 class="text-sm font-semibold text-gray-900">Items Currently Out</h2>
				</div>
				<a href="{requestsHref}?tab=active" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					View <ArrowRight size={13} />
				</a>
			</div>
			{#if reportLoading}
				<div class="h-72 animate-pulse space-y-4 px-5 py-4">
					{#each Array(4) as _}<Skeleton class="h-10 w-full" />{/each}
				</div>
			{:else if !report || report.inventory.itemsCurrentlyOut.length === 0}
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
						<li class="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/60">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
								<p class="text-xs text-gray-400">{item.category}</p>
							</div>
							<div class="flex shrink-0 items-center gap-3">
								<div class="flex items-center gap-1.5" title="Share of total stock currently out">
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
</div>
