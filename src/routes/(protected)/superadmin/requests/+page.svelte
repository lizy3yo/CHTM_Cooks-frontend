<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { 
		Search, 
		Download, 
		Info, 
		Eye, 
		CheckCircle, 
		XCircle,
		X,
		Clock, 
		AlertTriangle, 
		Wifi, 
		WifiOff,
		MoreVertical,
		RefreshCw,
		Package,
		PackageOpen,
		ClipboardList,
		Calendar,
		CalendarDays,
		BookOpen,
		UserCircle,
		FileText,
		User,
		Bell
	} from 'lucide-svelte';
	import { authStore } from '$lib/stores/auth';
	import { catalogAPI } from '$lib/api/catalog';
	import { classCodesAPI, type ClassCodeResponse } from '$lib/api/classCodes';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import ActionMenu from '$lib/components/ui/ActionMenu.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import { CheckCircle2 as ApproveIcon, XCircle as RejectIcon } from 'lucide-svelte';
	import { 
		borrowRequestsAPI, 
		type BorrowRequestItem,
		type BorrowRequestRecord, 
		type BorrowRequestRealtimeEvent,
		type BorrowRequestStatus
	} from '$lib/api/borrowRequests';
	import { replacementObligationsAPI, type ReplacementObligation } from '$lib/api/replacementObligations';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import QRCode from 'qrcode';
	import RequestsSkeletonLoader from '$lib/components/ui/RequestsSkeletonLoader.svelte';
	import ItemInspectionModal from '$lib/components/custodian/ItemInspectionModal.svelte';
	import ReplacementObligationModal from '$lib/components/custodian/ReplacementObligationModal.svelte';

	let activeTab = $state<'all' | 'pending' | 'active' | 'overdue' | 'history' | 'obligations'>('all');
	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let sseConnected = $state(false);

	let viewMode = $state<'list' | 'card'>('list');
	let itemPictureCache = $state<Map<string, string>>(new Map());
	let classCodeCache = $state<Map<string, ClassCodeResponse>>(new Map());
	let actionInFlightById = $state<Record<string, boolean>>({});

	let requests = $state<any[]>([]);
	let pagination = $state({ page: 1, limit: 20, total: 0, totalPages: 1 });
	let loading = $state(true);
	let cardsLoading = $state(true);
	let allLoading = $state(true);
	let pendingLoading = $state(true);
	let activeLoading = $state(true);
	let overdueLoading = $state(true);
	let historyLoading = $state(true);
	let obligationsLoading = $state(true);
	let inFlightLoadId = 0;

	const activeTabLoading = $derived.by(() => {
		switch (activeTab) {
			case 'all': return allLoading;
			case 'pending': return pendingLoading;
			case 'active': return activeLoading;
			case 'overdue': return overdueLoading;
			case 'history': return historyLoading;
			case 'obligations': return obligationsLoading;
			default: return false;
		}
	});

	let debounceTimer: ReturnType<typeof setTimeout>;

	// ─── Replacement Obligations ──────────────────────────────────────────────
	let obligations = $state<ReplacementObligation[]>([]);

	async function loadObligations(forceRefresh = true) {
		obligationsLoading = true;
		try {
			const res = await replacementObligationsAPI.getObligations({ limit: 200 }, { forceRefresh });
			obligations = res.obligations;
		} catch {
			/* silent — non-critical */
		} finally {
			obligationsLoading = false;
		}
	}

	const pendingObligations = $derived(obligations.filter(o => o.status === 'pending'));
	const resolvedObligations = $derived(obligations.filter(o => o.status !== 'pending'));

	let stats = $state({
		totalRequests: 0,
		pending: 0,
		active: 0,
		overdue: 0,
		completed: 0
	});

	let showDetailModal = $state(false);
	let selectedRequest = $state<BorrowRequestRecord | null>(null);
	let qrDataUrl = $state<string | null>(null);

	// ─── Inspection & Obligation Modals ──────────────────────────────────────
	let showInspectionModal = $state(false);
	let inspectionItems = $state<BorrowRequestItem[]>([]);
	let showObligationModal = $state(false);
	let activeRequestObligations = $state<ReplacementObligation[]>([]);
	let resolvingRequestId = $state<string | null>(null);

	let unsubscribeSSE: (() => void) | null = null;
	let openDropdown = $state<string | null>(null);
	let processingId = $state<string | null>(null);
	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	type WorkflowFilter = 'all' | 'pending_approval' | 'active_borrowings' | 'ready_for_pickup' | 'currently_borrowed' | 'pending_return' | 'missing' | 'overdue' | 'history' | 'returned' | 'resolved' | 'rejected' | 'cancelled' | 'obligations';

	function getWorkflowFilter(): WorkflowFilter {
		if (activeTab === 'obligations') return 'obligations';
		if (activeTab === 'overdue') return 'overdue';
		if (activeTab === 'pending') return 'pending_approval';

		if (activeTab === 'history') {
			if (selectedStatus === 'returned') return 'returned';
			if (selectedStatus === 'resolved') return 'resolved';
			if (selectedStatus === 'rejected') return 'rejected';
			if (selectedStatus === 'cancelled') return 'cancelled';
			return 'history';
		}

		if (activeTab === 'active') {
			if (selectedStatus === 'ready_for_pickup') return 'ready_for_pickup';
			if (selectedStatus === 'borrowed') return 'currently_borrowed';
			if (selectedStatus === 'pending_return') return 'pending_return';
			if (selectedStatus === 'missing') return 'missing';
			return 'active_borrowings';
		}

		return 'all';
	}

	function setWorkflowFilter(val: WorkflowFilter) {
		selectedStatus = 'all';
		switch (val) {
			case 'all': activeTab = 'all'; break;
			case 'pending_approval': activeTab = 'pending'; break;
			case 'active_borrowings': activeTab = 'active'; break;
			case 'ready_for_pickup': activeTab = 'active'; selectedStatus = 'ready_for_pickup'; break;
			case 'currently_borrowed': activeTab = 'active'; selectedStatus = 'borrowed'; break;
			case 'pending_return': activeTab = 'active'; selectedStatus = 'pending_return'; break;
			case 'missing': activeTab = 'active'; selectedStatus = 'missing'; break;
			case 'overdue': activeTab = 'overdue'; break;
			case 'history': activeTab = 'history'; break;
			case 'returned': activeTab = 'history'; selectedStatus = 'returned'; break;
			case 'resolved': activeTab = 'history'; selectedStatus = 'resolved'; break;
			case 'rejected': activeTab = 'history'; selectedStatus = 'rejected'; break;
			case 'cancelled': activeTab = 'history'; selectedStatus = 'cancelled'; break;
			case 'obligations': activeTab = 'obligations'; break;
		}
		pagination.page = 1;

		// Stale-while-revalidate: paint from cache immediately, then silently refresh.
		const hadCache = hydrateFromCache();
		void loadRequests(!hadCache, false);
	}

	let workflowFilter = $derived(getWorkflowFilter());

	const activeFilterBadge = $derived.by(() => {
		const filter = getWorkflowFilter();
		if (filter === 'all') return null;
		
		switch (filter) {
			case 'pending_approval': return { label: 'Pending Approval Only', bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-600/10', btn: 'text-yellow-500', btnHoverBg: 'hover:bg-yellow-100', btnHoverText: 'hover:text-yellow-700' };
			case 'active_borrowings': return { label: 'Currently Borrowed Only', bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', btn: 'text-purple-500', btnHoverBg: 'hover:bg-purple-100', btnHoverText: 'hover:text-purple-700' };
			case 'ready_for_pickup': return { label: 'Ready for Pickup', bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', btn: 'text-purple-500', btnHoverBg: 'hover:bg-purple-100', btnHoverText: 'hover:text-purple-700' };
			case 'currently_borrowed': return { label: 'Currently Borrowed', bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', btn: 'text-purple-500', btnHoverBg: 'hover:bg-purple-100', btnHoverText: 'hover:text-purple-700' };
			case 'pending_return': return { label: 'Confirm Pickup', bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', btn: 'text-purple-500', btnHoverBg: 'hover:bg-purple-100', btnHoverText: 'hover:text-purple-700' };
			case 'missing': return { label: 'Missing Items', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/10', btn: 'text-red-500', btnHoverBg: 'hover:bg-red-100', btnHoverText: 'hover:text-red-700' };
			case 'overdue': return { label: 'Overdue Only', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/10', btn: 'text-red-500', btnHoverBg: 'hover:bg-red-100', btnHoverText: 'hover:text-red-700' };
			case 'history': return { label: 'History (All)', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', btn: 'text-emerald-500', btnHoverBg: 'hover:bg-emerald-100', btnHoverText: 'hover:text-emerald-700' };
			case 'returned': return { label: 'Returned', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', btn: 'text-emerald-500', btnHoverBg: 'hover:bg-emerald-100', btnHoverText: 'hover:text-emerald-700' };
			case 'resolved': return { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', btn: 'text-emerald-500', btnHoverBg: 'hover:bg-emerald-100', btnHoverText: 'hover:text-emerald-700' };
			case 'rejected': return { label: 'Rejected', bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-600/10', btn: 'text-gray-500', btnHoverBg: 'hover:bg-gray-200', btnHoverText: 'hover:text-gray-700' };
			case 'cancelled': return { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-600/10', btn: 'text-gray-500', btnHoverBg: 'hover:bg-gray-200', btnHoverText: 'hover:text-gray-700' };
			case 'obligations': return { label: 'Replacement Obligations', bg: 'bg-pink-50', text: 'text-pink-700', ring: 'ring-pink-600/10', btn: 'text-pink-500', btnHoverBg: 'hover:bg-pink-100', btnHoverText: 'hover:text-pink-700' };
		}
	});

	function isCancelledRequest(status: BorrowRequestStatus, rejectionReason?: string): boolean {
		return (
			status === 'cancelled' ||
			(status === 'rejected' && rejectionReason === 'Request cancelled by student')
		);
	}

	function getDisplayId(id: string): string {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	function initials(name: string): string {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() || '')
			.join('');
	}

	function inferItemImage(name: string): string {
		const normalized = name.toLowerCase();
		if (normalized.includes('knife')) return 'Knife';
		if (normalized.includes('bowl')) return 'Bowl';
		if (normalized.includes('scale')) return 'Scale';
		if (normalized.includes('mixer')) return 'Mixer';
		if (normalized.includes('processor')) return 'Processor';
		return 'Item';
	}

	function formatDateTime(value?: string): string | undefined {
		if (!value) return undefined;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return undefined;
		return date.toLocaleString();
	}

	function isOverdue(request: any): boolean {
		if (!request) return false;
		const status = request.status ?? request.rawStatus;
		if (status !== 'borrowed') return false;
		const returnDate = request.returnDate;
		if (!returnDate) return false;
		return new Date(returnDate) < new Date();
	}

	function getStatusBadge(
		status: string,
		rawStatus: string,
		custodianStatus?: string,
		rejectionReason?: string
	) {
		if (isCancelledRequest(rawStatus as BorrowRequestStatus, rejectionReason)) {
			return { text: 'Cancelled', color: 'bg-gray-100 text-gray-700' };
		}
		if (status === 'pending_instructor' || status === 'pending_approval') {
			return { text: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800' };
		}
		if (status === 'approved_instructor' || rawStatus === 'ready_for_pickup') {
			return { text: custodianStatus === 'Ready for Pickup' ? 'Ready for Pickup' : 'With Custodian', color: 'bg-blue-100 text-blue-800' };
		}
		if (status === 'borrowed' || status === 'pending_return') {
			return { text: 'Currently Borrowed', color: 'bg-purple-100 text-purple-800' };
		}
		if (status === 'returned' || status === 'resolved') {
			return { text: 'Completed', color: 'bg-emerald-100 text-emerald-800' };
		}
		if (status === 'missing') {
			return { text: 'Unresolved', color: 'bg-red-100 text-red-800' };
		}
		if (status === 'rejected') {
			return { text: 'Declined', color: 'bg-gray-100 text-gray-700' };
		}
		return { text: status, color: 'bg-gray-100 text-gray-700' };
	}

	function getCardBorderColor(status: string, rawStatus: string, rejectionReason?: string) {
		if (isCancelledRequest(rawStatus as BorrowRequestStatus, rejectionReason)) {
			return 'border-gray-300';
		}
		if (status === 'pending_instructor' || status === 'pending_approval') return 'border-yellow-400';
		if (status === 'approved_instructor' || rawStatus === 'ready_for_pickup') return 'border-blue-400';
		if (status === 'borrowed' || status === 'pending_return') return 'border-purple-400';
		if (status === 'returned' || status === 'resolved') return 'border-emerald-400';
		if (status === 'missing') return 'border-red-400';
		if (status === 'rejected') return 'border-gray-300';
		return 'border-gray-200';
	}

	function mapRequest(record: BorrowRequestRecord): any {
		const studentName = record.student?.fullName || `Student ${record.studentId.slice(-6).toUpperCase()}`;
		return {
			rawId: record.id,
			rawStatus: record.status,
			rawItems: record.items,
			id: getDisplayId(record.id),
			student: {
				name: studentName,
				yearLevel: record.student?.yearLevel || 'N/A',
				block: record.student?.block || 'N/A',
				avatar: initials(studentName),
				avatarUrl: record.student?.profilePhotoUrl || null,
				studentId: record.studentId.slice(-8).toUpperCase(),
				email: record.student?.email || 'N/A'
			},
			items: record.items.map((item) => ({
				name: item.name,
				image: inferItemImage(item.name),
				itemId: item.itemId,
				picture: item.picture || null,
				code: item.itemId.slice(-6).toUpperCase(),
				quantity: item.quantity,
				inspection: item.inspection
			})),
			status: record.status,
			requestDate: record.createdAt,
			borrowDate: record.borrowDate,
			returnDate: record.returnDate,
			purpose: record.purpose,
			usageLocation: record.usageLocation,
			classCodeId: record.classCodeId,
			rejectionReason: record.rejectReason,
			rejectionNotes: record.rejectionNotes
		};
	}

	async function backfillClassCodes() {
		const missingCodes = new Set<string>();
		for (const req of requests) {
			if (req.classCodeId && !classCodeCache.has(req.classCodeId)) {
				missingCodes.add(req.classCodeId);
			}
		}
		if (missingCodes.size > 0) {
			for (const code of missingCodes) {
				classCodesAPI.getById(code).then((data: ClassCodeResponse) => {
					if (data) classCodeCache.set(code, data);
				}).catch(() => {});
			}
		}
	}

	function getListParams() {
		const statusesMap: Record<string, string[]> = {
			'all': [],
			'pending': ['pending_instructor'],
			'active': ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'missing'],
			'overdue': ['borrowed'],
			'history': ['returned', 'resolved', 'cancelled', 'rejected']
		};
		let statuses = statusesMap[activeTab] || [];
		if (selectedStatus !== 'all') {
			statuses = [selectedStatus];
		}
		return {
			statuses: statuses.length > 0 ? statuses as any : undefined,
			search: searchQuery || undefined,
			page: pagination.page,
			limit: pagination.limit,
			sortBy: 'createdAt' as const
		};
	}

	function hydrateFromCache(): boolean {
		const cached = borrowRequestsAPI.peekCachedList(getListParams());
		if (!cached) return false;

		let list = cached.requests;
		if (activeTab === 'overdue') {
			const now = new Date();
			list = list.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now);
		}

		requests = list.map(mapRequest);
		pagination = {
			page: cached.page,
			limit: cached.limit,
			total: cached.total,
			totalPages: cached.pages
		};
		loading = false;
		cardsLoading = false;
		allLoading = false;
		pendingLoading = false;
		activeLoading = false;
		overdueLoading = false;
		historyLoading = false;
		obligationsLoading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadRequests(false, forceRefresh);
			void loadStats(forceRefresh);
			void loadObligations(forceRefresh);
		}, 250);
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			const urlParams = new URLSearchParams(window.location.search);
			const filterParam = urlParams.get('filter') as WorkflowFilter | null;
			if (filterParam) {
				selectedStatus = 'all';
				switch (filterParam) {
					case 'all': activeTab = 'all'; break;
					case 'pending_approval': activeTab = 'pending'; break;
					case 'active_borrowings': activeTab = 'active'; break;
					case 'ready_for_pickup': activeTab = 'active'; selectedStatus = 'ready_for_pickup'; break;
					case 'currently_borrowed': activeTab = 'active'; selectedStatus = 'borrowed'; break;
					case 'pending_return': activeTab = 'active'; selectedStatus = 'pending_return'; break;
					case 'missing': activeTab = 'active'; selectedStatus = 'missing'; break;
					case 'overdue': activeTab = 'overdue'; break;
					case 'history': activeTab = 'history'; break;
					case 'returned': activeTab = 'history'; selectedStatus = 'returned'; break;
					case 'resolved': activeTab = 'history'; selectedStatus = 'resolved'; break;
					case 'rejected': activeTab = 'history'; selectedStatus = 'rejected'; break;
					case 'cancelled': activeTab = 'history'; selectedStatus = 'cancelled'; break;
					case 'obligations': activeTab = 'obligations'; break;
				}
				pagination.page = 1;
			}
		}
		hydrateFromCache();
		void loadRequests(requests.length === 0, false);
		void loadStats(false);
		void loadObligations(false);
		
		unsubscribeSSE = borrowRequestsAPI.subscribeToChanges((event) => {
			sseConnected = true;
			scheduleRefresh(true);
			const msgs: Record<string, string> = {
				created: 'New borrow request submitted',
				approved: 'Request approved',
				rejected: 'Request declined',
				released: 'Equipment released',
				picked_up: 'Equipment picked up',
				return_initiated: 'Return initiated',
				returned: 'Equipment returned',
				missing: 'Items marked missing',
				cancelled: 'Request cancelled',
				reminder_sent: 'Overdue reminder sent'
			};
			if (msgs[event.action]) {
				toastStore.info(msgs[event.action], 'Request Update');
			}
			
			if (selectedRequest && event.requestId === selectedRequest.id) {
				const freshReq = requests.find(r => r.id === selectedRequest!.id);
				if (freshReq) selectedRequest = freshReq;
			}
		});

		setTimeout(() => {
			sseConnected = true;
		}, 1500);
		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadRequests(false, true);
			void loadStats(true);
			void loadObligations(true);
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => { void loadRequests(false, true); void loadStats(true); };
		const onVisible = () => { if (document.visibilityState === 'visible') { void loadRequests(false, true); void loadStats(true); } };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeSSE?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadRequestsProgressive(forceRefresh = false) {
		const loadId = ++inFlightLoadId;
		try {
			const statsPromise = borrowRequestsAPI.list({ limit: 1000 }, { forceRefresh });
			const obligationsPromise = replacementObligationsAPI.getObligations({ limit: 200 }, { forceRefresh });
			const activeTabPromise = borrowRequestsAPI.list(getListParams(), { forceRefresh });
			const catalogPromise = catalogAPI.getCatalog({ availability: 'all', limit: 300 });

			const results = await Promise.allSettled([statsPromise, obligationsPromise, activeTabPromise, catalogPromise]);

			if (loadId !== inFlightLoadId) return;

			// Populate stats
			const statsRes = results[0];
			if (statsRes.status === 'fulfilled') {
				const all = statsRes.value.requests;
				const now = new Date();
				stats = {
					totalRequests: all.length,
					pending: all.filter(r => r.status === 'pending_instructor').length,
					active: all.filter(r => ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'missing'].includes(r.status)).length,
					overdue: all.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now).length,
					completed: all.filter(r => ['returned', 'resolved'].includes(r.status)).length
				};
			}

			// Populate obligations
			const obligationsRes = results[1];
			if (obligationsRes.status === 'fulfilled') {
				obligations = obligationsRes.value.obligations;
			}

			// Populate requests for active tab
			const activeTabRes = results[2];
			if (activeTabRes.status === 'fulfilled') {
				let list = activeTabRes.value.requests;
				if (activeTab === 'overdue') {
					const now = new Date();
					list = list.filter((r: any) => r.status === 'borrowed' && new Date(r.returnDate) < now);
				}
				requests = list.map(mapRequest);
				pagination = {
					page: activeTabRes.value.page,
					limit: activeTabRes.value.limit,
					total: activeTabRes.value.total,
					totalPages: activeTabRes.value.pages
				};
			}

			cardsLoading = false;

			// Settle tabs in sequence: all, pending, active, overdue, history, obligations
			allLoading = false;
			pendingLoading = false;
			activeLoading = false;
			overdueLoading = false;
			historyLoading = false;
			obligationsLoading = false;

			// Backfill pictures/classCodes in background
			const catalogResult = results[3];
			if (catalogResult.status === 'fulfilled') {
				const next = new Map(itemPictureCache);
				const missingIds = new Set<string>();
				for (const req of requests) {
					for (const item of req.items) {
						if (item.itemId && !item.picture && !itemPictureCache.has(item.itemId)) {
							missingIds.add(item.itemId);
						}
					}
				}
				for (const catalogItem of catalogResult.value.items) {
					if (missingIds.has(catalogItem.id) && catalogItem.picture) {
						next.set(catalogItem.id, catalogItem.picture);
					}
				}
				itemPictureCache = next;
			}
			await backfillClassCodes();

		} catch (error) {
			console.error('Failed progressive requests load', error);
		} finally {
			if (loadId === inFlightLoadId) {
				loading = false;
				cardsLoading = false;
				allLoading = false;
				pendingLoading = false;
				activeLoading = false;
				overdueLoading = false;
				historyLoading = false;
				obligationsLoading = false;
			}
		}
	}

	async function loadRequests(showLoader = true, forceRefresh = true) {
		if (!showLoader) {
			try {
				const res = await borrowRequestsAPI.list(getListParams(), { forceRefresh });
				let list = res.requests;
				if (activeTab === 'overdue') {
					const now = new Date();
					list = list.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now);
				}
				requests = list.map(mapRequest);
				pagination = {
					page: res.page,
					limit: res.limit,
					total: res.total,
					totalPages: res.pages
				};
			} catch (e: any) {
				toastStore.error(e.message || 'Failed to load requests');
			}
		} else {
			if (requests.length === 0) {
				if (activeTab === 'all') allLoading = true;
				else if (activeTab === 'pending') pendingLoading = true;
				else if (activeTab === 'active') activeLoading = true;
				else if (activeTab === 'overdue') overdueLoading = true;
				else if (activeTab === 'history') historyLoading = true;
				else if (activeTab === 'obligations') obligationsLoading = true;
			}
			await loadRequestsProgressive(forceRefresh);
		}
	}

	async function loadStats(forceRefresh = true) {
		try {
			const res = await borrowRequestsAPI.list({ limit: 1000 }, { forceRefresh });
			const all = res.requests;
			const now = new Date();

			stats = {
				totalRequests: all.length,
				pending: all.filter(r => r.status === 'pending_instructor').length,
				active: all.filter(r => ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'missing'].includes(r.status)).length,
				overdue: all.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now).length,
				completed: all.filter(r => ['returned', 'resolved'].includes(r.status)).length
			};
		} catch {
			/* silent */
		}
	}

	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			pagination.page = 1;
			loadRequests();
		}, 300);
	}

	function openDetail(request: BorrowRequestRecord) {
		selectedRequest = request;
		showDetailModal = true;
		qrDataUrl = null;
		QRCode.toDataURL(request.id, {
			width: 200,
			margin: 2,
			color: { dark: '#111827', light: '#ffffff' }
		}).then(url => { qrDataUrl = url; }).catch(() => {});
	}

	function getStatusBadgeColor(status: string): string {
		const colors: Record<string, string> = {
			pending_instructor: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
			approved_instructor: 'bg-blue-100 text-blue-800 border border-blue-200',
			ready_for_pickup: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
			borrowed: 'bg-purple-100 text-purple-800 border border-purple-200',
			pending_return: 'bg-orange-100 text-orange-800 border border-orange-200',
			missing: 'bg-rose-100 text-rose-800 border border-rose-200',
			returned: 'bg-teal-100 text-teal-800 border border-teal-200',
			resolved: 'bg-teal-100 text-teal-800 border border-teal-200',
			rejected: 'bg-red-100 text-red-800 border border-red-200',
			cancelled: 'bg-gray-100 text-gray-800 border border-gray-200'
		};
		return colors[status] || 'bg-gray-100 text-gray-800 border border-gray-200';
	}

	function getStatusLabel(status: string): string {
		const labels: Record<string, string> = {
			pending_instructor: 'Under Review',
			approved_instructor: 'Approved',
			ready_for_pickup: 'Ready for Pickup',
			borrowed: 'Currently Borrowed',
			pending_return: 'Confirm Pickup',
			missing: 'Item Missing',
			returned: 'Returned',
			resolved: 'Resolved',
			rejected: 'Declined',
			cancelled: 'Cancelled'
		};
		return labels[status] || status;
	}



	// ─── Workflow Helpers ─────────────────────────────────────────────────────

	function buildInspectionItems(request: any): BorrowRequestItem[] {
		const requestItemById = new Map<string, any>();
		for (const item of request.items ?? []) {
			requestItemById.set(item.itemId, item);
		}
		return (request.rawItems ?? []).map((item: BorrowRequestItem) => {
			const fallbackPicture =
				requestItemById.get(item.itemId)?.picture ?? itemPictureCache.get(item.itemId) ?? null;
			return { ...item, picture: item.picture ?? fallbackPicture };
		});
	}

	async function handleInspectionSubmit(
		inspections: Array<{
			itemId: string;
			status: 'good' | 'damaged' | 'missing';
			notes: string;
			replacementQuantity?: number;
			dueDate?: string;
			additionalReturned?: number;
		}>
	): Promise<void> {
		if (!selectedRequest) return;
		try {
			const result = await borrowRequestsAPI.inspectItems((selectedRequest as any).rawId, inspections);
			await loadRequests(false);
			await loadStats();
			await loadObligations(true);
			showInspectionModal = false;
			selectedRequest = null;
			inspectionItems = [];
			if (result.obligationsCreated > 0) {
				toastStore.success(
					`Inspection complete. ${result.obligationsCreated} replacement obligation(s) created for damaged or missing items.`
				);
			} else {
				toastStore.success('All items returned intact. Inventory updated successfully.');
			}
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to submit inspection.');
			throw e;
		}
	}

	async function openResolveModal(rawId: string): Promise<void> {
		resolvingRequestId = rawId;
		try {
			const res = await replacementObligationsAPI.getObligations({ limit: 500 }, { forceRefresh: true });
			const requestObligations = res.obligations.filter((o) => o.borrowRequestId === rawId);
			if (requestObligations.length === 0) {
				toastStore.info('No pending obligations found for this request.');
				return;
			}
			activeRequestObligations = requestObligations;
			showObligationModal = true;
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to retrieve obligations.');
		} finally {
			resolvingRequestId = null;
		}
	}

	async function handleResolveObligation(id: string, quantityReplaced: number): Promise<void> {
		try {
			await replacementObligationsAPI.resolveObligation(id, {
				resolutionType: 'replacement',
				amountPaid: quantityReplaced
			});
			toastStore.success('Obligation resolved successfully.');
			const rawId = activeRequestObligations[0]?.borrowRequestId;
			if (rawId) {
				const res = await replacementObligationsAPI.getObligations({ limit: 500 }, { forceRefresh: true });
				activeRequestObligations = res.obligations.filter((o) => o.borrowRequestId === rawId);
			}
			await loadRequests(false);
			await loadStats();
			await loadObligations(true);
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to resolve obligation.');
			throw e;
		}
	}

	// ─── Action Handler ───────────────────────────────────────────────────────

	async function handleAction(action: string, request: any) {
		openDropdown = null;
		actionInFlightById[request.rawId] = true;
		try {
			// ── Instructor-level actions ──────────────────────────────────────
			if (action === 'approve') {
				const confirmed = await confirmStore.confirm({
					title: 'Approve Request',
					message: 'Approve this borrow request on behalf of the instructor?',
					confirmText: 'Approve'
				});
				if (!confirmed) return;
				await borrowRequestsAPI.approve(request.rawId);
				toastStore.success('Request approved.');

			} else if (action === 'reject') {
				const confirmed = await confirmStore.danger('Decline this request?', 'Decline Request', 'Decline');
				if (!confirmed) return;
				await borrowRequestsAPI.reject(request.rawId, 'Superadmin Override');
				toastStore.success('Request declined.');

			// ── Custodian-level actions ───────────────────────────────────────
			} else if (action === 'release') {
				const confirmed = await confirmStore.confirm({
					title: 'Release for Pickup',
					message: 'Mark this request as ready for student pickup?',
					type: 'info',
					confirmText: 'Release for Pickup'
				});
				if (!confirmed) return;
				await borrowRequestsAPI.release(request.rawId);
				toastStore.success('Request marked ready for student pickup.');

			} else if (action === 'pickup') {
				const confirmed = await confirmStore.confirm({
					title: 'Confirm Pickup',
					message: 'Confirm that the student has successfully picked up all released items?',
					type: 'warning',
					confirmText: 'Confirm Pickup'
				});
				if (!confirmed) return;
				await borrowRequestsAPI.pickup(request.rawId);
				toastStore.success('Pickup confirmed successfully.');

			} else if (action === 'confirmReturn') {
				// Opens the item inspection modal — no direct API call here
				selectedRequest = request;
				inspectionItems = buildInspectionItems(request);
				showInspectionModal = true;
				showDetailModal = false;
				return; // Early return — modal handles the rest

			} else if (action === 'markMissing') {
				const confirmed = await confirmStore.danger(
					'Mark this request as missing? Use only when an item cannot be accounted for after verification.',
					'Mark as Missing',
					'Mark Missing'
				);
				if (!confirmed) return;
				await borrowRequestsAPI.markMissing(request.rawId);
				toastStore.warning('Request marked as missing for escalation and follow-up.');

			} else if (action === 'resolveObligation') {
				await openResolveModal(request.rawId);
				return; // Early return — modal handles the rest

			// ── Shared actions ────────────────────────────────────────────────
			} else if (action === 'remind') {
				const confirmed = await confirmStore.confirm({
					title: 'Send Overdue Reminder',
					message: 'Send an overdue reminder to the student now?',
					confirmText: 'Send Reminder'
				});
				if (!confirmed) return;
				const result = await borrowRequestsAPI.sendOverdueReminder(request.rawId);
				toastStore.info(`${result.message} (total reminders: ${result.reminderCount})`);

			} else if (action === 'cancel') {
				const confirmed = await confirmStore.danger('Cancel this request?', 'Cancel Request', 'Cancel');
				if (!confirmed) return;
				await borrowRequestsAPI.cancel(request.rawId);
				toastStore.success('Request cancelled.');
			}

			await loadRequests(false);
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Action failed.');
		} finally {
			actionInFlightById[request.rawId] = false;
		}
	}

	function exportData() {
		const headers = ['Request ID', 'Student', 'Instructor', 'Status', 'Request Date', 'Borrow Date', 'Return Date', 'Purpose', 'Items'];
		const rows = requests.map(r => [
			r.id,
			r.student.name || '—',
			r.approvedBy || '—',
			r.status,
			formatDateTime(r.requestDate) || '—',
			formatDateTime(r.borrowDate) || '—',
			formatDateTime(r.returnDate) || '—',
			`"${r.purpose?.replace(/"/g, '""') || ''}"`,
			`"${r.items.map((i: any) => `${i.quantity}x ${i.name}`).join('; ')}"`
		]);
		
		const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `request-export-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Request Management | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Request Management</h1>
			<p class="mt-0.5 text-sm text-gray-500">System-wide oversight of all equipment borrow requests</p>
		</div>

	</div>

	{#if activeTabLoading && requests.length === 0}
		<RequestsSkeletonLoader viewMode="list" />
	{:else}
		<!-- Stats -->
		{#if cardsLoading}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 animate-pulse">
				{#each Array(5) as _, i}
					<div class="rounded-lg bg-white p-3 shadow sm:p-5 h-[80px] sm:h-[116px] {i === 4 ? 'col-span-2 sm:col-span-1' : ''}">
						<div class="flex items-center justify-between gap-2 h-full">
							<div class="space-y-2 flex-1">
								<div class="h-4 bg-gray-200 rounded w-2/3"></div>
								<div class="h-6 bg-gray-200 rounded w-1/3"></div>
							</div>
							<div class="h-9 w-9 sm:h-12 sm:w-12 bg-gray-200 rounded-full"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				<button 
					type="button"
					onclick={() => setWorkflowFilter('all')}
					class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-gray-500/20 cursor-pointer sm:p-5
					{workflowFilter === 'all' ? 'border border-gray-300 bg-gray-50/50 ring-1 ring-gray-200 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-gray-200 hover:bg-gray-50/50'}"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total Requests</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{stats.totalRequests.toLocaleString()}</p>
						</div>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:h-12 sm:w-12">
							<ClipboardList size={18} class="text-gray-500 sm:hidden" aria-hidden="true" />
							<ClipboardList size={24} class="hidden text-gray-500 sm:block" aria-hidden="true" />
						</div>
					</div>
				</button>
				<button 
					type="button"
					onclick={() => setWorkflowFilter('pending_approval')}
					class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 cursor-pointer sm:p-5
					{workflowFilter === 'pending_approval' ? 'border border-yellow-200 bg-yellow-50/30 ring-1 ring-yellow-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-yellow-200/50 hover:bg-gray-50/50'}"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pending</p>
							<p class="mt-1 text-2xl font-semibold text-yellow-600 sm:mt-2 sm:text-3xl">{stats.pending}</p>
						</div>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-100 sm:h-12 sm:w-12">
							<Clock size={18} class="text-yellow-600 sm:hidden" aria-hidden="true" />
							<Clock size={24} class="hidden text-yellow-600 sm:block" aria-hidden="true" />
						</div>
					</div>
				</button>
				<button 
					type="button"
					onclick={() => setWorkflowFilter('active_borrowings')}
					class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-purple-500/20 cursor-pointer sm:p-5
					{workflowFilter === 'active_borrowings' ? 'border border-purple-200 bg-purple-50/30 ring-1 ring-purple-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-purple-200/50 hover:bg-gray-50/50'}"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Currently Borrowed</p>
							<p class="mt-1 text-2xl font-semibold text-purple-600 sm:mt-2 sm:text-3xl">{stats.active}</p>
						</div>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 sm:h-12 sm:w-12">
							<PackageOpen size={18} class="text-purple-600 sm:hidden" aria-hidden="true" />
							<PackageOpen size={24} class="hidden text-purple-600 sm:block" aria-hidden="true" />
						</div>
					</div>
				</button>
				<button 
					type="button"
					onclick={() => setWorkflowFilter('overdue')}
					class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer sm:p-5
					{workflowFilter === 'overdue' ? 'border border-red-200 bg-red-50/30 ring-1 ring-red-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-red-200/50 hover:bg-gray-50/50'}"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Overdue</p>
							<p class="mt-1 text-2xl font-semibold text-red-600 sm:mt-2 sm:text-3xl">{stats.overdue}</p>
						</div>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12">
							<AlertTriangle size={18} class="text-red-600 sm:hidden" aria-hidden="true" />
							<AlertTriangle size={24} class="hidden text-red-600 sm:block" aria-hidden="true" />
						</div>
					</div>
				</button>
				<button 
					type="button"
					onclick={() => setWorkflowFilter('history')}
					class="col-span-2 w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer sm:col-span-1 sm:p-5
					{workflowFilter === 'history' ? 'border border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-emerald-200/50 hover:bg-gray-50/50'}"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Completed</p>
							<p class="mt-1 text-2xl font-semibold text-emerald-600 sm:mt-2 sm:text-3xl">{stats.completed.toLocaleString()}</p>
						</div>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 sm:h-12 sm:w-12">
							<CheckCircle size={18} class="text-emerald-600 sm:hidden" aria-hidden="true" />
							<CheckCircle size={24} class="hidden text-emerald-600 sm:block" aria-hidden="true" />
						</div>
					</div>
				</button>
			</div>
		{/if}

	<!-- Filters Bar -->
	<div class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-1 items-center gap-2">
			<div class="relative max-w-md flex-1">
				<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input 
					type="text" 
					bind:value={searchQuery} 
					oninput={onSearchInput}
					placeholder="Search by ID, student, or items..." 
					class="block w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100" 
				/>
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<select
				value={workflowFilter}
				onchange={(e) => setWorkflowFilter(e.currentTarget.value as WorkflowFilter)}
				class="h-10 min-w-[180px] rounded-xl border border-gray-300 bg-white px-3 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100"
			>
				<option value="all">All Requests</option>
				<option value="pending_approval">Pending Approval</option>
				<optgroup label="Currently Borrowed">
					<option value="active_borrowings">All Currently Borrowed</option>
					<option value="ready_for_pickup">Ready for Pickup</option>
					<option value="currently_borrowed">Currently Borrowed</option>
					<option value="pending_return">Confirm Pickup</option>
					<option value="missing">Missing Items</option>
				</optgroup>
				<option value="overdue">Overdue Only</option>
				<optgroup label="History">
					<option value="history">All History</option>
					<option value="returned">Returned</option>
					<option value="resolved">Resolved</option>
					<option value="rejected">Rejected</option>
					<option value="cancelled">Cancelled</option>
				</optgroup>
				<option value="obligations">Replacement Obligations</option>
			</select>
			<button onclick={exportData} class="flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
				<Download size={18} />
				Export
			</button>
			<button
				onclick={() => {
					searchQuery = '';
					setWorkflowFilter('all');
				}}
				class="h-10 rounded-xl px-2 text-sm font-semibold text-pink-600 transition-colors hover:bg-pink-50 hover:text-pink-700"
			>
				Clear
			</button>
		</div>
	</div>

	<div class="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<span class="text-sm font-semibold text-gray-700">
				{#if workflowFilter === 'obligations'}
					{obligations.length} {obligations.length === 1 ? 'obligation' : 'obligations'} found
				{:else}
					{pagination.total} {pagination.total === 1 ? 'request' : 'requests'} found
				{/if}
			</span>
			{#if activeFilterBadge}
				<span class="inline-flex items-center gap-1 rounded-full {activeFilterBadge.bg} px-2 py-0.5 text-xs font-semibold {activeFilterBadge.text} ring-1 {activeFilterBadge.ring}">
					{activeFilterBadge.label}
					<button 
						onclick={() => setWorkflowFilter('all')}
						class="ml-0.5 rounded-full p-0.5 {activeFilterBadge.btn} {activeFilterBadge.btnHoverBg} {activeFilterBadge.btnHoverText} focus:outline-none"
						aria-label="Clear filter"
					>
						<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</span>
			{/if}
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2">
			<div class="flex overflow-hidden rounded-lg border border-gray-300">
				<button
					onclick={() => (viewMode = 'list')}
					aria-label="Table view"
					class="flex h-10 w-10 items-center justify-center text-sm transition-colors {viewMode === 'list' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
				</button>
				<button
					onclick={() => (viewMode = 'card')}
					aria-label="Card view"
					class="flex h-10 w-10 items-center justify-center border-l border-gray-300 text-sm transition-colors {viewMode === 'card' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
					</svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Main List — hidden on obligations tab -->
	{#if workflowFilter !== 'obligations'}
			<!-- Request Views -->
			{#if activeTabLoading && requests.length === 0}
				<RequestsSkeletonLoader {viewMode} />
			{:else if requests.length > 0}
				{#if viewMode === 'card'}
					<div style="min-height: 600px;">
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style="align-content: start;">
							{#each requests as request}
								{@const overdue = request.status === 'borrowed' && new Date(request.returnDate) < new Date()}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="relative cursor-pointer overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md {getCardBorderColor(
										request.status,
										request.rawStatus,
										request.rejectionReason
									)}"
									onclick={() => openDetail(request)}
									role="button"
									tabindex="0"
									onkeydown={(e) => e.key === 'Enter' && openDetail(request)}
								>
									<div class="p-4 sm:p-5">
										<!-- Header: Student, Request ID, Status -->
										<div class="mb-3 flex items-start justify-between gap-3">
											<div class="flex min-w-0 flex-1 items-center gap-3">
												<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
													{#if request.student.avatarUrl}
														<img src={request.student.avatarUrl} alt={request.student.name} class="h-full w-full object-cover" loading="lazy" />
													{:else}
														{request.student.avatar}
													{/if}
												</div>
												<div class="flex min-w-0 flex-col gap-1">
													<div class="flex items-center gap-1.5">
														<span class="truncate font-semibold text-gray-900">{request.student.name}</span>
													</div>
													<span class="truncate font-mono text-xs text-gray-500">{request.id}</span>
												</div>
											</div>
											<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold {getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).color}">
												{getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).text}
											</span>
										</div>

										<!-- Qty & Date -->
										<div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
											<div class="flex items-center gap-1.5">
												<Package class="h-4 w-4" />
												<span class="font-medium text-gray-900">Qty: {request.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</span>
											</div>
											<div class="flex items-center gap-1.5">
												<Calendar size={16} />
												<span>{formatDateTime(request.borrowDate)?.split(',')[0]} to {formatDateTime(request.returnDate)?.split(',')[0]}</span>
											</div>
										</div>
									</div>

									<!-- Card Footer -->
									<div class="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5">
										{#if !['returned', 'resolved', 'cancelled', 'rejected'].includes(request.status)}
											<div class="relative flex items-center">
												<div onclick={(e) => e.stopPropagation()} role="none">
													<ActionMenu
														align="right"
														triggerLabel="Request actions"
														items={[
															// ── Instructor actions ──
															...(request.status === 'pending_instructor' ? [
																{ label: actionInFlightById[request.rawId] ? 'Approving…' : 'Approve Request', icon: ApproveIcon, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('approve', request) },
																{ label: 'Decline Request', icon: RejectIcon, variant: 'danger' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('reject', request) }
															] : []),
															// ── Custodian actions ──
															...(request.status === 'approved_instructor' ? [
																{ label: 'Release for Pickup', icon: PackageOpen, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('release', request) }
															] : []),
															...(request.status === 'ready_for_pickup' ? [
																{ label: 'Confirm Pickup', icon: CheckCircle, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('pickup', request) }
															] : []),
															...(request.status === 'pending_return' ? [
																{ label: 'Inspect & Confirm Return', icon: PackageOpen, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('confirmReturn', request) }
															] : []),
															...(request.status === 'borrowed' ? [
																{ label: 'Inspect & Confirm Return', icon: PackageOpen, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('confirmReturn', request) },
																{ label: 'Mark as Missing', icon: AlertTriangle, variant: 'warning' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('markMissing', request) }
															] : []),
															...(request.status === 'missing' ? [
																{ label: 'Resolve Obligation', icon: CheckCircle, variant: 'success' as const, disabled: !!resolvingRequestId, action: () => handleAction('resolveObligation', request) }
															] : []),
															// ── Overdue reminder ──
															...(overdue ? [{ label: 'Send Overdue Reminder', icon: Bell, variant: 'warning' as const, action: () => handleAction('remind', request) }] : []),
															// ── Cancel ──
															{ label: 'Cancel Request', icon: X, variant: 'default' as const, action: () => handleAction('cancel', request) }
														]}
													/>
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<!-- List View -->
					<div style="min-height: 600px;">
						<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
							<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid md:grid-cols-[auto_0.6fr_1fr_2.4fr_0.8fr_120px] md:items-center md:gap-4">
								<span class="text-center text-gray-400">#</span>
								<span>Request</span>
								<span>Requested By</span>
								<span>Items</span>
								<span>Status</span>
								<span class="text-right">Actions</span>
							</div>
							<div class="divide-y divide-gray-100">
								{#each requests as request, i}
									{@const overdue = request.status === 'borrowed' && new Date(request.returnDate) < new Date()}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="grid cursor-pointer gap-3 p-4 transition-colors md:grid-cols-[auto_0.6fr_1fr_2.4fr_0.8fr_120px] md:items-start md:gap-4 hover:bg-gray-50"
										onclick={() => openDetail(request)}
										role="button"
										tabindex="0"
										onkeydown={(e) => e.key === 'Enter' && openDetail(request)}
									>
										<div class="hidden items-center justify-center pt-0.5 md:flex">
											<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{i + 1}</span>
										</div>
										<div class="min-w-0">
											<p class="font-mono text-xs font-bold tracking-wider text-gray-900">{request.id}</p>
											<p class="mt-1 text-xs text-gray-500">{formatDateTime(request.requestDate)?.split(',')[0]}</p>
											{#if overdue}
												<span class="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200">
													<AlertTriangle size={10} /> Overdue
												</span>
											{/if}
										</div>

										<div class="flex min-w-0 items-center gap-3">
											<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
												{#if request.student.avatarUrl}
													<img src={request.student.avatarUrl} alt={request.student.name} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													{request.student.avatar}
												{/if}
											</div>
											<div class="min-w-0">
												<div class="flex items-center gap-1.5">
													<p class="truncate text-sm font-semibold text-gray-900">{request.student.name}</p>
												</div>
												<p class="truncate text-xs text-gray-500">{request.student.yearLevel} • Block {request.student.block}</p>
											</div>
										</div>

										<div class="min-w-0">
											<div class="flex flex-wrap gap-1.5">
												{#each request.items.slice(0, 3) as item}
													{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
													<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
														{#if pic}
															<img src={pic} alt={item.name} class="h-3.5 w-3.5 shrink-0 rounded object-cover" loading="lazy" />
														{:else}
															<span class="h-3.5 w-3.5 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
														{/if}
														<span class="max-w-[100px] truncate">{item.name}</span>
													</span>
												{/each}
												{#if request.items.length > 3}
													<span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">+{request.items.length - 3} more</span>
												{/if}
											</div>
											<p class="mt-1 truncate text-xs text-gray-500">{request.purpose}</p>
										</div>

										<div class="min-w-0">
											<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold {getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).color}">
												<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
												{getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).text}
											</span>
											{#if request.status === 'approved_instructor' && request.instructor?.fullName}
												<p class="mt-1 truncate text-[11px] text-gray-500">Approved by {request.instructor.fullName}</p>
											{/if}
											{#if request.status === 'rejected' && request.instructor?.fullName}
												<p class="mt-1 truncate text-[11px] text-gray-500">Reviewed by {request.instructor.fullName}</p>
											{/if}
										</div>

										{#if !['returned', 'resolved', 'cancelled', 'rejected'].includes(request.status)}
											<div class="relative flex items-center justify-end">
												<div onclick={(e) => e.stopPropagation()} role="none">
													<ActionMenu
														align="right"
														triggerLabel="Request actions"
														items={[
															// ── Instructor actions ──
															...(request.status === 'pending_instructor' ? [
																{ label: actionInFlightById[request.rawId] ? 'Approving…' : 'Approve Request', icon: ApproveIcon, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('approve', request) },
																{ label: 'Decline Request', icon: RejectIcon, variant: 'danger' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('reject', request) }
															] : []),
															// ── Custodian actions ──
															...(request.status === 'approved_instructor' ? [
																{ label: 'Release for Pickup', icon: PackageOpen, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('release', request) }
															] : []),
															...(request.status === 'ready_for_pickup' ? [
																{ label: 'Confirm Pickup', icon: CheckCircle, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('pickup', request) }
															] : []),
															...(request.status === 'pending_return' ? [
																{ label: 'Inspect & Confirm Return', icon: PackageOpen, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('confirmReturn', request) }
															] : []),
															...(request.status === 'borrowed' ? [
																{ label: 'Inspect & Confirm Return', icon: PackageOpen, variant: 'success' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('confirmReturn', request) },
																{ label: 'Mark as Missing', icon: AlertTriangle, variant: 'warning' as const, disabled: actionInFlightById[request.rawId], action: () => handleAction('markMissing', request) }
															] : []),
															...(request.status === 'missing' ? [
																{ label: 'Resolve Obligation', icon: CheckCircle, variant: 'success' as const, disabled: !!resolvingRequestId, action: () => handleAction('resolveObligation', request) }
															] : []),
															// ── Overdue reminder ──
															...(overdue ? [{ label: 'Send Overdue Reminder', icon: Bell, variant: 'warning' as const, action: () => handleAction('remind', request) }] : []),
															// ── Cancel ──
															{ label: 'Cancel Request', icon: X, variant: 'default' as const, action: () => handleAction('cancel', request) }
														]}
													/>
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			{:else}
				<div class="py-16 text-center" style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
					<div>
						<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
							<Package class="h-10 w-10 text-pink-600" />
						</div>
						<h3 class="mt-4 text-lg font-semibold text-gray-900">No requests found</h3>
						<p class="mt-2 text-sm text-gray-500">Try adjusting your filters or search query.</p>
					</div>
				</div>
			{/if}
		<!-- Pagination -->
		{#if pagination.totalPages > 1}
			<Pagination
				currentPage={pagination.page}
				totalPages={pagination.totalPages}
				totalItems={pagination.total}
				itemsPerPage={pagination.limit}
				onPageChange={(p) => { pagination.page = p; loadRequests(); }}
				class="mt-4"
			/>
		{/if}
	{/if}

	<!-- ─── Replacement Obligations Tab ──────────────────────────────────────── -->
	{#if workflowFilter === 'obligations'}
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<!-- Summary pills -->
			<div class="flex items-center gap-3 border-b border-gray-200 bg-gray-50/60 px-6 py-3">
				<span class="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-800">
					<Clock size={12} /> {pendingObligations.length} Pending
				</span>
				<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
					<CheckCircle size={12} /> {resolvedObligations.length} Resolved
				</span>
			</div>

			{#if obligationsLoading && obligations.length === 0}
				<div class="flex items-center justify-center py-16">
					<RefreshCw class="h-6 w-6 animate-spin text-pink-500" />
					<p class="ml-3 text-sm text-gray-500">Loading obligations…</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
								<th scope="col" class="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Incident Date</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each obligations as ob}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="whitespace-nowrap px-6 py-4">
										<p class="font-medium text-gray-900">{ob.itemName}</p>
										<p class="text-xs text-gray-500">Req: REQ-{ob.borrowRequestId.slice(-6).toUpperCase()}</p>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<p class="font-medium text-gray-900">{ob.studentName || 'Unknown Student'}</p>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 capitalize">{ob.type}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-center">
										<span class="font-bold text-gray-900">{ob.amount}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDateTime(ob.incidentDate)}</td>
									<td class="whitespace-nowrap px-6 py-4">
										{#if ob.status === 'pending'}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-2.5 py-1 text-xs font-medium text-pink-800">
												<Clock size={12} /> Pending
											</span>
										{:else}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
												<CheckCircle size={12} /> Resolved
											</span>
										{/if}
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="6" class="px-6 py-16 text-center">
										<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-4">
											<CheckCircle class="h-6 w-6 text-gray-400" />
										</div>
										<h3 class="text-sm font-medium text-gray-900">No Replacement Obligations</h3>
										<p class="mt-1 text-sm text-gray-500">All equipment replacements have been resolved.</p>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
	{/if}
</div>

<!-- Details Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={() => showDetailModal = false}
			aria-label="Close modal"
			tabindex="-1"
		></button>

		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
				role="dialog"
				aria-modal="true"
				aria-labelledby="request-detail-title"
			>
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
					<div class="px-6 py-5">
						<div class="flex items-start gap-4">
							<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/30">
								<Eye size={22} class="text-white" aria-hidden="true" />
							</div>
							<div class="min-w-0 flex-1">
								<h2 id="request-detail-title" class="text-lg font-bold text-gray-900">Request Details</h2>
								<div class="mt-0.5 flex items-center gap-2">
									<p class="text-sm text-gray-500">REQ-{selectedRequest.id.slice(-6).toUpperCase()}</p>
									{#if isOverdue(selectedRequest)}
										<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
											<AlertTriangle size={11} /> Overdue
										</span>
									{/if}
								</div>
							</div>
							<button
								type="button"
								onclick={() => showDetailModal = false}
								class="shrink-0 rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
								aria-label="Close request details"
							>
								<X size={20} />
							</button>
						</div>
					</div>
				</div>

				<!-- Body -->
				<div class="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
					<!-- Status -->
					<div class="flex flex-wrap items-center gap-2">
						<span class="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold {getStatusBadgeColor(selectedRequest.status)}">
							{getStatusLabel(selectedRequest.status)}
						</span>
						{#if isOverdue(selectedRequest)}
							<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
								<AlertTriangle size={11} /> Overdue
							</span>
						{/if}
					</div>

					<!-- Request Information -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1.5 w-1.5 rounded-full bg-pink-500"></div>
							Request Information
						</h3>
						<div class="grid grid-cols-2 gap-3">
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<CalendarDays size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Request Date</p>
								</div>
								<p class="text-sm font-bold text-gray-900">
									{new Date(selectedRequest.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<CalendarDays size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Borrow Period</p>
								</div>
								<p class="text-sm font-bold text-gray-900">
									{new Date(selectedRequest.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(selectedRequest.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<UserCircle size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Student</p>
								</div>
								<div class="flex items-center gap-2">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
										{#if selectedRequest.student?.profilePhotoUrl}
											<img src={selectedRequest.student.profilePhotoUrl} alt={selectedRequest.student.fullName} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											{selectedRequest.student?.firstName?.[0] || ''}{selectedRequest.student?.lastName?.[0] || ''}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="truncate text-sm font-bold text-gray-900">{selectedRequest.student?.fullName || 'Unknown'}</p>
										<p class="truncate text-xs text-gray-500">{selectedRequest.student?.email || ''}</p>
									</div>
								</div>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<UserCircle size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Instructor</p>
								</div>
								<div class="flex items-center gap-2">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
										{#if selectedRequest.instructor?.profilePhotoUrl}
											<img src={selectedRequest.instructor.profilePhotoUrl} alt={selectedRequest.instructor.fullName} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											{selectedRequest.instructor?.firstName?.[0] || ''}{selectedRequest.instructor?.lastName?.[0] || ''}
										{/if}
									</div>
									<p class="truncate text-sm font-bold text-gray-900">{selectedRequest.instructor?.fullName || 'Pending'}</p>
								</div>
							</div>
							{#if selectedRequest.custodian}
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
									<div class="mb-2 flex items-center gap-1.5">
										<UserCircle size={14} class="text-pink-500" aria-hidden="true" />
										<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Custodian</p>
									</div>
									<div class="flex items-center gap-2">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
											{#if selectedRequest.custodian.profilePhotoUrl}
												<img src={selectedRequest.custodian.profilePhotoUrl} alt={selectedRequest.custodian.fullName} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{selectedRequest.custodian.firstName?.[0] || ''}{selectedRequest.custodian.lastName?.[0] || ''}
											{/if}
										</div>
										<p class="truncate text-sm font-bold text-gray-900">{selectedRequest.custodian.fullName || '—'}</p>
									</div>
								</div>
							{/if}
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<BookOpen size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Class Code</p>
								</div>
								<p class="text-sm font-bold text-gray-900">{selectedRequest.classCodeId?.slice(-6).toUpperCase() || '—'}</p>
							</div>
							<div class="group col-span-2 rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<FileText size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Purpose</p>
								</div>
								<p class="text-sm font-bold text-gray-900">{selectedRequest.purpose}</p>
							</div>
						</div>
					</div>

					<!-- Requested Items -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1.5 w-1.5 rounded-full bg-pink-500"></div>
							Requested Items
						</h3>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each selectedRequest.items as item}
								<div class="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-pink-200 hover:shadow-md">
									{#if item.picture}
										<img src={item.picture} alt={item.name} class="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-gray-100" loading="lazy" />
									{:else}
										<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-100">
											<Package size={20} class="text-gray-400" aria-hidden="true" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-pink-600">{item.name}</p>
										{#if item.inspection?.status}
											<p class="text-xs capitalize text-gray-500">Condition: {item.inspection.status}</p>
										{/if}
									</div>
									<span class="shrink-0 rounded-full bg-pink-100 px-2.5 py-1 text-xs font-bold text-pink-700">×{item.quantity}</span>
								</div>
							{/each}
						</div>
					</div>


				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-6 py-4">
					<div class="flex justify-end">
						<button
							type="button"
							onclick={() => showDetailModal = false}
							class="rounded-xl border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}



<!-- Item Inspection Modal -->
{#if showInspectionModal && selectedRequest}
	<ItemInspectionModal
		items={inspectionItems}
		requestId={(selectedRequest as any).rawId}
		onSubmit={handleInspectionSubmit}
		onCancel={() => {
			showInspectionModal = false;
			selectedRequest = null;
			inspectionItems = [];
		}}
	/>
{/if}

<!-- Replacement Obligation Modal -->
{#if showObligationModal && activeRequestObligations.length > 0}
	<ReplacementObligationModal
		obligations={activeRequestObligations}
		itemPictures={itemPictureCache}
		onResolve={handleResolveObligation}
		onCancel={() => {
			showObligationModal = false;
			activeRequestObligations = [];
		}}
	/>
{/if}
