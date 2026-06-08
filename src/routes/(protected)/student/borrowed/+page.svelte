<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import {
		borrowRequestsAPI,
		type BorrowRequestRealtimeEvent,
		type BorrowRequestRecord
	} from '$lib/api/borrowRequests';
	import { catalogAPI } from '$lib/api/catalog';
	import { replacementObligationsAPI } from '$lib/api/replacementObligations';
	import { confirmStore } from '$lib/stores/confirm';
	import { toastStore } from '$lib/stores/toast';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import QRCode from 'qrcode';
	import { ClipboardX, Package, AlertCircle, Clock, AlertTriangle, X, BookOpen, User, Calendar, FileText, QrCode, FileCheck, CheckCheck, PackageCheck, Truck, Home, CircleX, CalendarDays, UserCircle, CircleAlert, CornerDownLeft } from 'lucide-svelte';
	type BorrowedFilter = 'all' | 'overdue' | 'due-soon' | 'on-track' | 'return-initiated' | 'unresolved';
	type BorrowedSort = 'urgent' | 'due-date' | 'latest-borrowed';
	type ViewMode = 'by-request' | 'by-item';
	type ItemOperationalStatus = 'in-use' | 'return-in-progress' | 'returned' | 'damaged' | 'missing' | 'replaced' | 'payable' | 'paid' | 'unresolved-damaged' | 'unresolved-missing';

	const PAGE_SIZE_BY_REQUEST = 5;
	const PAGE_SIZE_BY_ITEM = 10;

	interface BorrowedCard {
		id: string;
		requestCode: string;
		items: BorrowRequestRecord['items'];
		borrowDate: string;
		returnDate: string;
		status: BorrowRequestRecord['status'];
		isOverdue: boolean;
		isDueSoon: boolean;
		daysDelta: number;
		borrowPeriodDays: number;
		remainingProgress: number;
		purpose: string;
		instructorName: string;
		returnedItems: number;
		damagedItems: number;
		missingItems: number;
		hasUnresolvedIssue: boolean;
		unresolvedItems: number;
		instructorPhoto: string | null;
		custodianName: string;
		custodianPhoto: string | null;
		classCodeString: string;
		classSubjectString: string;
		requestDate: string;
		approvedDate: string | null;
		releasedDate: string | null;
		pickedUpDate: string | null;
		returnedDate: string | null;
		missingDate: string | null;
		resolvedDate: string | null;
	}

	interface ItemRow {
		requestId: string;
		requestCode: string;
		itemName: string;
		quantity: number;
		borrowDate: string;
		returnDate: string;
		instructorName: string;
		status: ItemOperationalStatus;
		settlementLabel: string;
		isOverdue: boolean;
		daysDelta: number;
		hasUnresolvedIssue: boolean;
		picture?: string | null;
	}

	let isLoading = $state(true);
	let showQrModal = $state(false);
	let qrDataUrl = $state<string | null>(null);
	let qrBorrowed = $state<BorrowedCard | null>(null);
	let actionLoadingId = $state<string | null>(null);
	let search = $state('');
	let viewMode = $state<ViewMode>('by-request');
	let selectedBorrowed = $state<BorrowedCard | null>(null);
	let hasShownOverdueModal = $state(false);
	let selectedFilter = $state<BorrowedFilter>('all');
	let sortBy = $state<BorrowedSort>('urgent');
	let currentPage = $state(1);
	let borrowedRequests = $state<BorrowedCard[]>([]);
	let liveSyncActive = $state(false);
	let hasNoEnrollment = $state(false);
	let loadingClassCodes = $state(false);
	let availableClassCodes = $state<any[]>([]);

	async function loadStudentClassCodes() {
		loadingClassCodes = true;
		hasNoEnrollment = false;
		try {
			const response = await fetch('/api/class-codes/my-classes', {
				method: 'GET',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			if (!response.ok) throw new Error('Failed to fetch class codes');
			const data = await response.json();
			availableClassCodes = data.classCodes || [];
			if (availableClassCodes.length === 0) {
				hasNoEnrollment = true;
			}
		} catch (error) {
			console.error('[CLASS-CODES] Failed to load class codes:', error);
			hasNoEnrollment = true;
		} finally {
			loadingClassCodes = false;
		}
	}

	let refreshInFlight = false;
	let pendingRefresh = false;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let unresolvedRequestIds = $state<Set<string>>(new Set());
	let unresolvedItemKeys = $state<Set<string>>(new Set());
	let itemPictureCache = $state<Map<string, string>>(new Map());
	let lastLoadError = '';

	function buildIssueKey(requestId: string, itemId: string): string {
		return `${requestId}:${itemId}`;
	}

	function formatRequestCode(id: string): string {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	function inferItemIcon(itemName: string): string {
		const normalized = itemName.toLowerCase();
		if (normalized.includes('knife')) return '🔪';
		if (normalized.includes('bowl')) return '🥣';
		if (normalized.includes('scale')) return '⚖️';
		if (normalized.includes('mixer')) return '🎛️';
		if (normalized.includes('processor')) return '🔧';
		return '📦';
	}

	function toBorrowedCard(request: BorrowRequestRecord): BorrowedCard {
		const now = new Date();
		const borrow = new Date(request.borrowDate);
		const due = new Date(request.returnDate);

		const msPerDay = 1000 * 60 * 60 * 24;
		const borrowPeriodDays = Math.max(1, Math.ceil((due.getTime() - borrow.getTime()) / msPerDay));
		const daysDelta = Math.ceil((due.getTime() - now.getTime()) / msPerDay);
		const isOverdue = daysDelta < 0;
		const isDueSoon = daysDelta >= 0 && daysDelta <= 2;

		const elapsedDays = Math.max(0, Math.ceil((now.getTime() - borrow.getTime()) / msPerDay));
		const remainingProgress = Math.max(0, Math.min(100, Math.round(((borrowPeriodDays - elapsedDays) / borrowPeriodDays) * 100)));

		const returnedItems = request.items.filter((item) => item.inspection?.status === 'good').length;
		const damagedItems = request.items.filter((item) => item.inspection?.status === 'damaged').length;
		const missingItems = request.items.filter((item) => item.inspection?.status === 'missing').length;
		const unresolvedItems = request.items.filter((item) =>
			unresolvedItemKeys.has(buildIssueKey(request.id, item.itemId))
		).length;

		return {
			id: request.id,
			requestCode: formatRequestCode(request.id),
			items: request.items,
			borrowDate: request.borrowDate,
			returnDate: request.returnDate,
			status: request.status,
			isOverdue,
			isDueSoon,
			daysDelta,
			borrowPeriodDays,
			remainingProgress,
			purpose: request.purpose,
			instructorName: request.instructor?.fullName || 'Assigned Instructor',
			instructorPhoto: request.instructor?.profilePhotoUrl || null,
			custodianName: request.custodian?.fullName || 'Pending Custodian',
			custodianPhoto: request.custodian?.profilePhotoUrl || null,
			classCodeString: (request as any).classCode?.code || request.classCodeId || 'N/A',
			classSubjectString: (request as any).classCode?.subject || 'Class',
			requestDate: request.createdAt,
			returnedItems,
			damagedItems,
			missingItems,
			hasUnresolvedIssue: unresolvedRequestIds.has(request.id),
			unresolvedItems,
			approvedDate: request.approvedAt || null,
			releasedDate: request.releasedAt || null,
			pickedUpDate: request.pickedUpAt || null,
			returnedDate: request.returnedAt || null,
			missingDate: request.missingAt || null,
			resolvedDate: request.resolvedAt || null
		};
	}

	function getApprovalTimeline(borrowed: BorrowedCard) {
		const timeline: Array<{ step: string; status: string; date: string | null; by: string; }> = [
			{ step: 'Request Submitted', status: 'completed', date: borrowed.requestDate, by: 'You' }
		];

		timeline.push({
			step: 'Approved',
			status: 'completed',
			date: borrowed.approvedDate || borrowed.requestDate,
			by: borrowed.instructorName
		});

		timeline.push({
			step: 'Custodian Approved',
			status: 'completed',
			date: borrowed.releasedDate || borrowed.borrowDate,
			by: borrowed.custodianName
		});

		timeline.push({
			step: 'Pickup Confirmed',
			status: 'completed',
			date: borrowed.pickedUpDate || borrowed.borrowDate,
			by: 'Custodian'
		});

		if (borrowed.status === 'borrowed') {
			timeline.push({ step: 'Awaiting Return', status: 'pending', date: null, by: 'Student' });
		} else if (borrowed.status === 'pending_return') {
			timeline.push({ step: 'Return Initiated', status: 'completed', date: borrowed.returnDate, by: 'You' });
			timeline.push({ step: 'Awaiting Inspection', status: 'pending', date: null, by: 'Custodian' });
		} else if (borrowed.status === 'returned' || borrowed.status === 'resolved') {
			timeline.push({
				step: 'Returned',
				status: 'completed',
				date: borrowed.returnedDate || borrowed.returnDate,
				by: 'Student'
			});
		} else {
			const hasMissing = borrowed.status === 'missing' || borrowed.missingItems > 0;
			const hasDamaged = borrowed.damagedItems > 0;

			if (hasMissing && hasDamaged) {
				timeline.push({
					step: 'Unresolved Incidents',
					status: 'rejected',
					date: borrowed.missingDate || borrowed.returnedDate || borrowed.returnDate,
					by: 'Custodian'
				});
			} else if (hasMissing) {
				timeline.push({
					step: 'Item Missing',
					status: 'rejected',
					date: borrowed.missingDate || borrowed.returnDate,
					by: 'Custodian'
				});
			} else if (hasDamaged) {
				timeline.push({
					step: 'Item Damaged',
					status: 'rejected',
					date: borrowed.returnedDate || borrowed.returnDate,
					by: 'Custodian'
				});
			}
		}

		return timeline;
	}

	function getItemStatus(item: BorrowRequestRecord['items'][number], borrowed: BorrowedCard): ItemOperationalStatus {
		const notes = (item.inspection?.notes || '').toLowerCase();
		const hasUnresolvedIssue = unresolvedItemKeys.has(buildIssueKey(borrowed.id, item.itemId));
		if (notes.includes('paid')) return 'paid';
		if (notes.includes('replaced')) return 'replaced';
		if (hasUnresolvedIssue && item.inspection?.status === 'damaged') return 'unresolved-damaged';
		if (hasUnresolvedIssue && item.inspection?.status === 'missing') return 'unresolved-missing';
		if (item.inspection?.status === 'good') return 'returned';
		if (item.inspection?.status === 'damaged' && (notes.includes('pay') || notes.includes('charge'))) return 'payable';
		if (item.inspection?.status === 'damaged') return 'damaged';
		if (item.inspection?.status === 'missing' && (notes.includes('pay') || notes.includes('charge'))) return 'payable';
		if (item.inspection?.status === 'missing') return 'missing';
		if (borrowed.status === 'pending_return') return 'return-in-progress';
		return 'in-use';
	}

	function getItemStatusLabel(status: ItemOperationalStatus): string {
		if (status === 'returned') return 'Returned';
		if (status === 'unresolved-damaged') return 'Damaged';
		if (status === 'unresolved-missing') return 'Missing';
		if (status === 'damaged') return 'Damaged';
		if (status === 'missing') return 'Missing';
		if (status === 'replaced') return 'Replaced';
		if (status === 'payable') return 'Payable';
		if (status === 'return-in-progress') return 'Return in Progress';
		return 'In Use';
	}

	function getItemStatusClasses(status: ItemOperationalStatus): string {
		if (status === 'returned') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
		if (status === 'unresolved-damaged') return 'bg-rose-100 text-rose-700 ring-rose-200';
		if (status === 'unresolved-missing') return 'bg-red-100 text-red-700 ring-red-200';
		if (status === 'damaged') return 'bg-amber-100 text-amber-700 ring-amber-200';
		if (status === 'missing') return 'bg-red-100 text-red-700 ring-red-200';
		if (status === 'replaced') return 'bg-cyan-100 text-cyan-700 ring-cyan-200';
		if (status === 'payable') return 'bg-orange-100 text-orange-700 ring-orange-200';
		if (status === 'return-in-progress') return 'bg-slate-100 text-slate-700 ring-slate-200';
		return 'bg-blue-100 text-blue-700 ring-blue-200';
	}

	function getSettlementLabel(item: BorrowRequestRecord['items'][number], requestId: string): string {
		const isUnresolved = unresolvedItemKeys.has(buildIssueKey(requestId, item.itemId));
		if (isUnresolved) return 'Open incident case';
		if (item.inspection?.status === 'good') return 'No charge';
		if (item.inspection?.status === 'damaged' || item.inspection?.status === 'missing') {
			return item.inspection.replacementQuantity
				? `Replacement quantity: ${item.inspection.replacementQuantity.toLocaleString()}`
				: 'Replacement quantity';
		}
		return 'Not assessed';
	}

	async function loadBorrowedItems(forceRefresh = false): Promise<void> {
		const shouldShowLoading = borrowedRequests.length === 0;
		if (shouldShowLoading) {
			isLoading = true;
		}

		try {
			const [requestResponse, obligationResponse] = await Promise.all([
				borrowRequestsAPI.list(
					{
						statuses: ['borrowed', 'pending_return', 'missing'],
						sortBy: 'returnDate',
						page: 1,
						limit: 100
					},
					{ forceRefresh }
				),
				replacementObligationsAPI.getObligations(
					{ status: 'pending', limit: 200 },
					{ forceRefresh }
				)
			]);

			const nextUnresolvedRequestIds = new Set(obligationResponse.obligations.map((obligation) => obligation.borrowRequestId));
			const nextUnresolvedItemKeys = new Set(
				obligationResponse.obligations.map((obligation) => buildIssueKey(obligation.borrowRequestId, obligation.itemId))
			);
			unresolvedRequestIds = nextUnresolvedRequestIds;
			unresolvedItemKeys = nextUnresolvedItemKeys;

			const requests = requestResponse.requests;

			borrowedRequests = requests
				.filter((request) => request.status === 'borrowed' || request.status === 'pending_return' || (request.status === 'missing' && nextUnresolvedRequestIds.has(request.id)))
				.map(toBorrowedCard);
			lastLoadError = '';

			await backfillItemPictures();
			syncSelectedBorrowed();

			const overdueCount = borrowedRequests.filter((borrowed) => borrowed.isOverdue).length;
			if (overdueCount > 0 && !hasShownOverdueModal) {
				hasShownOverdueModal = true;
				void confirmStore.warning(
					`You currently have ${overdueCount} overdue item${overdueCount > 1 ? 's' : ''}. Please proceed to the custodian desk for return confirmation.`,
					'Immediate Attention Required',
					'Understood',
					'Later'
				);
			}
		} catch (error) {
			console.error('Failed to load borrowed items', error);
			const message = error instanceof Error ? error.message : 'Unable to load borrowed items.';
			if (message !== lastLoadError) {
				toastStore.error(message, 'Borrowed Items');
				lastLoadError = message;
			}
		} finally {
			isLoading = false;
		}
	}

	function openBorrowedDetails(borrowed: BorrowedCard): void {
		selectedBorrowed = borrowed;
	}

	function closeBorrowedDetails(): void {
		selectedBorrowed = null;
	}

	function syncSelectedBorrowed(): void {
		if (!selectedBorrowed) return;
		const fresh = borrowedRequests.find((borrowed) => borrowed.id === selectedBorrowed?.id);
		selectedBorrowed = fresh ?? null;
	}

	async function backfillItemPictures(): Promise<void> {
		const missingIds = new Set<string>();

		for (const borrowed of borrowedRequests) {
			for (const item of borrowed.items) {
				if (item.itemId && !item.picture && !itemPictureCache.has(item.itemId)) {
					missingIds.add(item.itemId);
				}
			}
		}

		if (missingIds.size === 0) return;

		try {
			const response = await catalogAPI.getCatalog({ availability: 'all', limit: 300 });
			const next = new Map(itemPictureCache);

			for (const catalogItem of response.items) {
				if (missingIds.has(catalogItem.id) && catalogItem.picture) {
					next.set(catalogItem.id, catalogItem.picture);
				}
			}

			itemPictureCache = next;
		} catch {
			// Fall back gracefully to icon-only rendering if catalog images are unavailable.
		}
	}

	async function refreshBorrowedItems(): Promise<void> {
		if (refreshInFlight) {
			pendingRefresh = true;
			return;
		}

		refreshInFlight = true;
		try {
			borrowRequestsAPI.invalidateCache();
			replacementObligationsAPI.invalidateCache();
			await loadBorrowedItems(true);
		} finally {
			refreshInFlight = false;
			if (pendingRefresh) {
				pendingRefresh = false;
				await refreshBorrowedItems();
			}
		}
	}

	function scheduleRefresh(): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			refreshBorrowedItems();
		}, 250);
	}

	function getBorrowedTone(borrowed: BorrowedCard): 'danger' | 'warning' | 'safe' | 'muted' {
		if (borrowed.hasUnresolvedIssue) return 'danger';
		if (borrowed.status === 'missing') return 'danger';
		if (borrowed.status === 'pending_return') return 'muted';
		if (borrowed.isOverdue) return 'danger';
		if (borrowed.isDueSoon) return 'warning';
		return 'safe';
	}

	function getBorrowedBadgeClasses(borrowed: BorrowedCard): string {
		const tone = getBorrowedTone(borrowed);
		if (tone === 'danger') return 'bg-red-100 text-red-700 ring-red-200';
		if (tone === 'warning') return 'bg-amber-100 text-amber-700 ring-amber-200';
		if (tone === 'safe') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
		return 'bg-slate-100 text-slate-700 ring-slate-200';
	}

	function getBorrowedCardBorderClasses(borrowed: BorrowedCard): string {
		const tone = getBorrowedTone(borrowed);
		if (tone === 'danger') return 'border-l-red-500';
		if (tone === 'warning') return 'border-l-amber-500';
		if (tone === 'safe') return 'border-l-emerald-500';
		return 'border-l-slate-400';
	}

	function getBorrowedStateLabel(borrowed: BorrowedCard): string {
		if (borrowed.hasUnresolvedIssue || borrowed.status === 'missing') return 'Unresolved';
		if (borrowed.status === 'pending_return') return 'Awaiting Return Confirmation';
		if (borrowed.isOverdue) return 'Overdue';
		if (borrowed.isDueSoon) return 'Due Soon';
		return 'Currently Borrowed';
	}

	function getBorrowedTimelineColorClasses(borrowed: BorrowedCard): string {
		if (borrowed.isOverdue || borrowed.hasUnresolvedIssue || borrowed.status === 'missing') return 'bg-red-500';
		if (borrowed.isDueSoon) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function getBorrowedSummary(borrowed: BorrowedCard): string {
		if (borrowed.hasUnresolvedIssue) return `${borrowed.unresolvedItems} unresolved item ${borrowed.unresolvedItems === 1 ? 'case' : 'cases'}`;
		if (borrowed.status === 'missing') return 'Marked as missing. Coordinate with custodian immediately.';
		if (borrowed.status === 'pending_return') return 'Return awaiting custodian confirmation.';
		if (borrowed.isOverdue) return `${Math.abs(borrowed.daysDelta)} day${Math.abs(borrowed.daysDelta) > 1 ? 's' : ''} overdue`;
		if (borrowed.daysDelta === 0) return 'Due today';
		if (borrowed.isDueSoon) return `Due in ${borrowed.daysDelta} day${borrowed.daysDelta > 1 ? 's' : ''}`;
		return `${borrowed.daysDelta} days remaining`;
	}

	const filteredBorrowed = $derived.by(() => {
		const normalizedSearch = search.trim().toLowerCase();

		let output = borrowedRequests.filter((borrowed) => {
			if (selectedFilter === 'overdue' && !borrowed.isOverdue) return false;
			if (selectedFilter === 'due-soon' && !borrowed.isDueSoon) return false;
			if (selectedFilter === 'on-track' && (borrowed.isOverdue || borrowed.isDueSoon || borrowed.status !== 'borrowed')) return false;
			if (selectedFilter === 'return-initiated' && borrowed.status !== 'pending_return') return false;
			if (selectedFilter === 'unresolved' && !borrowed.hasUnresolvedIssue) return false;

			if (!normalizedSearch) return true;

			const itemNames = borrowed.items.map((item) => item.name).join(' ').toLowerCase();
			const haystack = `${borrowed.requestCode} ${borrowed.purpose} ${borrowed.instructorName} ${itemNames}`.toLowerCase();
			return haystack.includes(normalizedSearch);
		});

		output = [...output].sort((a, b) => {
			if (sortBy === 'due-date') {
				return new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime();
			}

			if (sortBy === 'latest-borrowed') {
				return new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime();
			}

			const urgencyA = a.isOverdue ? -10 : a.status === 'missing' ? -9 : a.daysDelta;
			const urgencyB = b.isOverdue ? -10 : b.status === 'missing' ? -9 : b.daysDelta;
			return urgencyA - urgencyB;
		});

		return output;
	});

	const itemRows = $derived.by(() => {
		const rows: ItemRow[] = [];
		for (const borrowed of filteredBorrowed) {
			for (const item of borrowed.items) {
				rows.push({
					requestId: borrowed.id,
					requestCode: borrowed.requestCode,
					itemName: item.name,
					quantity: item.quantity,
					borrowDate: borrowed.borrowDate,
					returnDate: borrowed.returnDate,
					instructorName: borrowed.instructorName,
					status: getItemStatus(item, borrowed),
					settlementLabel: getSettlementLabel(item, borrowed.id),
					isOverdue: borrowed.isOverdue,
					daysDelta: borrowed.daysDelta,
					hasUnresolvedIssue: unresolvedItemKeys.has(buildIssueKey(borrowed.id, item.itemId)),
					picture: item.picture ?? itemPictureCache.get(item.itemId) ?? null
				});
			}
		}

		if (!search.trim()) return rows;
		const needle = search.trim().toLowerCase();
		return rows.filter((row) => {
			const text = `${row.requestCode} ${row.itemName} ${row.instructorName} ${row.settlementLabel}`.toLowerCase();
			return text.includes(needle);
		});
	});

	const currentPageSize = $derived(viewMode === 'by-request' ? PAGE_SIZE_BY_REQUEST : PAGE_SIZE_BY_ITEM);

	const totalEntries = $derived(viewMode === 'by-request' ? filteredBorrowed.length : itemRows.length);

	const totalPages = $derived(Math.max(1, Math.ceil(totalEntries / currentPageSize)));

	const paginatedBorrowed = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE_BY_REQUEST;
		const end = start + PAGE_SIZE_BY_REQUEST;
		return filteredBorrowed.slice(start, end);
	});

	const paginatedItemRows = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE_BY_ITEM;
		const end = start + PAGE_SIZE_BY_ITEM;
		return itemRows.slice(start, end);
	});

	const pageStart = $derived(totalEntries === 0 ? 0 : (currentPage - 1) * currentPageSize + 1);
	const pageEnd = $derived(Math.min(currentPage * currentPageSize, totalEntries));

	// Reset pagination when user changes filters/sort/search/view mode.
	$effect(() => {
		search;
		selectedFilter;
		sortBy;
		viewMode;
		currentPage = 1;
	});

	// Keep page index valid when result count shrinks.
	$effect(() => {
		totalPages;
		if (currentPage > totalPages) {
			currentPage = totalPages;
		}
	});

	const metrics = $derived({
		totalActive: borrowedRequests.length,
		overdue: borrowedRequests.filter((borrowed) => borrowed.isOverdue).length,
		dueSoon: borrowedRequests.filter((borrowed) => borrowed.isDueSoon).length,
		unresolved: borrowedRequests.filter((borrowed) => borrowed.hasUnresolvedIssue).length
	});

	afterNavigate(({ to }) => {
		const filter = to?.url.searchParams.get('filter') ?? null;
		if (filter && ['all', 'overdue', 'due-soon', 'on-track', 'return-initiated', 'unresolved'].includes(filter)) {
			selectedFilter = filter as BorrowedFilter;
		}
	});

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const filter = params.get('filter');
		if (filter && ['all', 'overdue', 'due-soon', 'on-track', 'return-initiated', 'unresolved'].includes(filter)) {
			selectedFilter = filter as BorrowedFilter;
		}

		void loadBorrowedItems();
		void loadStudentClassCodes();

		const unsubscribeSSE = borrowRequestsAPI.subscribeToChanges((_event: BorrowRequestRealtimeEvent) => {
			scheduleRefresh();
		});
		liveSyncActive = true;

		const pollInterval = setInterval(() => {
			void refreshBorrowedItems();
		}, 30_000);

		const onFocus = () => {
			void refreshBorrowedItems();
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void refreshBorrowedItems();
			}
		};

		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeSSE();
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			clearInterval(pollInterval);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	function getDetailModalStatusLabel(borrowed: BorrowedCard | null): string {
		if (!borrowed) return '';
		const hasMissing = borrowed.status === 'missing' || borrowed.items?.some((item: any) => item.inspection?.status === 'missing');
		const hasDamaged = borrowed.items?.some((item: any) => item.inspection?.status === 'damaged');

		if (hasMissing && hasDamaged) {
			return 'Unresolved Incidents';
		} else if (hasMissing) {
			return 'Item Missing';
		} else if (hasDamaged) {
			return 'Item Damaged';
		}
		return getBorrowedStateLabel(borrowed);
	}

	function getDetailModalStatusColor(borrowed: BorrowedCard | null): string {
		if (!borrowed) return 'bg-gray-100 text-gray-800';
		const hasMissing = borrowed.status === 'missing' || borrowed.items?.some((item: any) => item.inspection?.status === 'missing');
		const hasDamaged = borrowed.items?.some((item: any) => item.inspection?.status === 'damaged');

		if (hasMissing && hasDamaged) {
			return 'bg-rose-100 text-rose-800';
		} else if (hasMissing) {
			return 'bg-rose-100 text-rose-800';
		} else if (hasDamaged) {
			return 'bg-amber-100 text-amber-800';
		}
		return getBorrowedBadgeClasses(borrowed);
	}

	function getDetailModalStatusIcon(borrowed: BorrowedCard | null): any {
		if (!borrowed) return Clock;
		const hasMissing = borrowed.status === 'missing' || borrowed.items?.some((item: any) => item.inspection?.status === 'missing');
		const hasDamaged = borrowed.items?.some((item: any) => item.inspection?.status === 'damaged');

		if (hasMissing || hasDamaged) {
			return CircleAlert;
		}
		if (borrowed.status === 'pending_return') return CornerDownLeft;
		return PackageCheck;
	}

	const SelectedStatusIcon = $derived.by(() =>
		selectedBorrowed ? getDetailModalStatusIcon(selectedBorrowed) : Clock
	);
</script>

<svelte:head>
	<title>My Borrowed Items - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">My Borrowed Items</h1>
		<p class="mt-1 text-sm text-gray-500">Track your currently borrowed equipment</p>
	</div>

	<!-- Statistics Cards -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<button
			onclick={() => (selectedFilter = 'all')}
			class="w-full text-left rounded-lg p-3 shadow sm:p-5 border transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer {selectedFilter === 'all' ? 'border-blue-200 bg-blue-50/50 shadow-sm' : 'bg-white border-transparent hover:shadow-md hover:border-blue-200/50 hover:bg-blue-50/10'}"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Currently Borrowed</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{metrics.totalActive}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<Package size={18} class="text-blue-600 sm:hidden" />
					<Package size={24} class="hidden text-blue-600 sm:block" />
				</div>
			</div>
		</button>

		<button
			onclick={() => (selectedFilter = 'overdue')}
			class="w-full text-left rounded-lg p-3 shadow sm:p-5 border transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer {selectedFilter === 'overdue' ? 'border-red-200 bg-red-50/50 shadow-sm' : 'bg-white border-transparent hover:shadow-md hover:border-red-200/50 hover:bg-red-50/10'}"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Overdue</p>
					<p class="mt-1 text-2xl font-semibold text-red-600 sm:mt-2 sm:text-3xl">{metrics.overdue}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12">
					<AlertCircle size={18} class="text-red-600 sm:hidden" />
					<AlertCircle size={24} class="hidden text-red-600 sm:block" />
				</div>
			</div>
		</button>

		<button
			onclick={() => (selectedFilter = 'due-soon')}
			class="w-full text-left rounded-lg p-3 shadow sm:p-5 border transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer {selectedFilter === 'due-soon' ? 'border-amber-200 bg-amber-50/50 shadow-sm' : 'bg-white border-transparent hover:shadow-md hover:border-amber-200/50 hover:bg-amber-50/10'}"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Due Soon (48h)</p>
					<p class="mt-1 text-2xl font-semibold text-amber-600 sm:mt-2 sm:text-3xl">{metrics.dueSoon}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12">
					<Clock size={18} class="text-amber-600 sm:hidden" />
					<Clock size={24} class="hidden text-amber-600 sm:block" />
				</div>
			</div>
		</button>

		<button
			onclick={() => (selectedFilter = 'unresolved')}
			class="w-full text-left rounded-lg p-3 shadow sm:p-5 border transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer {selectedFilter === 'unresolved' ? 'border-rose-200 bg-rose-50/50 shadow-sm' : 'bg-white border-transparent hover:shadow-md hover:border-rose-200/50 hover:bg-rose-50/10'}"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Unresolved Cases</p>
					<p class="mt-1 text-2xl font-semibold text-rose-600 sm:mt-2 sm:text-3xl">{metrics.unresolved}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 sm:h-12 sm:w-12">
					<AlertTriangle size={18} class="text-rose-600 sm:hidden" />
					<AlertTriangle size={24} class="hidden text-rose-600 sm:block" />
				</div>
			</div>
		</button>
	</div>

	<div class="rounded-xl bg-white shadow-sm">
		<div class="p-4 sm:p-6">
		<div class="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
		<!-- Row 1: view toggle -->
		<div class="flex items-center justify-between gap-3">
			<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
				<button
					onclick={() => (viewMode = 'by-request')}
					class="rounded-md px-3 py-1.5 transition-colors {viewMode === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
				>
					By Request
				</button>
				<button
					onclick={() => (viewMode = 'by-item')}
					class="rounded-md px-3 py-1.5 transition-colors {viewMode === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
				>
					By Item
				</button>
			</div>
		</div>
		<!-- Row 2: filter + sort selects -->
		<div class="mt-2 flex gap-2">
			<select bind:value={selectedFilter} class="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
				<option value="all">Currently Borrowed</option>
				<option value="overdue">Overdue</option>
				<option value="due-soon">Due Soon</option>
				<option value="on-track">On Track</option>
				<option value="return-initiated">Return Initiated</option>
				<option value="unresolved">Unresolved</option>
			</select>
			<select bind:value={sortBy} class="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
				<option value="urgent">Most Urgent</option>
				<option value="due-date">Due Date</option>
				<option value="latest-borrowed">Latest Borrowed</option>
			</select>
		</div>
		<!-- Row 3: search -->
		<div class="mt-2">
			<input
				type="text"
				bind:value={search}
				placeholder="Search by request code, item, purpose, or instructor"
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
			/>
		</div>
		</div>

		{#if hasNoEnrollment}
			<div class="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm animate-fadeIn">
				<div class="flex gap-3">
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div class="flex-1 min-w-0">
						<h3 class="text-sm font-bold text-red-900">Enrollment Required</h3>
						<p class="mt-1 text-xs text-red-700 leading-relaxed">
							You are not currently enrolled in any active class. You must be enrolled in at least one class to request equipment. Please contact your instructor or administrator to be added to a class.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<div class="min-h-150 flex flex-col">
		<div class="flex-1 space-y-4">
		{#if isLoading}
			<div class="space-y-4" role="status" aria-live="polite" aria-label="Loading borrowed items">

				<!-- Metric cards skeleton — matches grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 -->
				<div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
					{#each Array(4) as _}
						<div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100 sm:p-4">
							<Skeleton class="h-3 w-16" />
							<div class="mt-2">
								<Skeleton class="h-7 w-10" />
							</div>
						</div>
					{/each}
				</div>

				<!-- Filter toolbar skeleton — matches actual toolbar layout -->
				<div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100 sm:p-4">
					<!-- Row 1: toggle -->
					<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
						<Skeleton class="h-7 w-20 rounded-md" />
						<Skeleton class="h-7 w-16 rounded-md" />
					</div>
					<!-- Row 2: selects -->
					<div class="mt-2 flex gap-2">
						<Skeleton class="h-9 flex-1 rounded-lg" />
						<Skeleton class="h-9 flex-1 rounded-lg" />
					</div>
					<!-- Row 3: search -->
					<div class="mt-2">
						<Skeleton class="h-9 w-full rounded-lg" />
					</div>
				</div>

				<!-- List view skeletons -->
				<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 md:grid md:grid-cols-[32px_1.2fr_2fr_1fr_120px] md:gap-4">
						{#each Array(5) as _}
							<Skeleton class="h-4 w-full" />
						{/each}
					</div>
					<div class="divide-y divide-gray-100">
						{#each Array(5) as _}
							<div class="grid gap-3 p-4 md:grid-cols-[32px_1.2fr_2fr_1fr_120px] md:items-start md:gap-4">
								<Skeleton class="h-5 w-5 rounded-full" />
								<div class="space-y-2"><Skeleton class="h-4 w-24" /><Skeleton class="h-3 w-32" /></div>
								<div class="space-y-2"><Skeleton class="h-6 w-full" /><Skeleton class="h-3 w-40" /></div>
								<Skeleton class="h-6 w-20 rounded-full" />
								<Skeleton class="h-8 w-24 rounded-full justify-self-end" />
							</div>
						{/each}
					</div>
				</div>
			</div>
		{:else if filteredBorrowed.length === 0}
			<div class="flex min-h-90 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
					<ClipboardX size={26} class="text-pink-600" />
				</div>
				<p class="mt-4 text-base font-semibold text-gray-800">No borrowed items found</p>
				<p class="mt-1 text-sm text-gray-500">You have no active borrowed items in this view. Adjust filters or submit a new request.</p>
				<div class="mt-6">
					<a href="/student/catalog" class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
						Browse Catalog
					</a>
				</div>
			</div>
		{:else if viewMode === 'by-request'}
				<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[32px_1.2fr_2fr_1fr_120px] md:items-center md:gap-4">
						<span class="text-center text-gray-400">#</span>
						<span>Request</span>
						<span>Items & Purpose</span>
						<span>Status</span>
						<span class="text-right">Actions</span>
					</div>
					<div class="divide-y divide-gray-100">
						{#each paginatedBorrowed as borrowed, i}
							{@const rowNum = (currentPage - 1) * PAGE_SIZE_BY_REQUEST + i + 1}
							<div class="grid gap-3 p-4 md:grid-cols-[32px_1.2fr_2fr_1fr_120px] md:items-start md:gap-4 transition-colors cursor-pointer hover:bg-gray-50" data-request-id={borrowed.id} onclick={() => openBorrowedDetails(borrowed)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && openBorrowedDetails(borrowed)} aria-label="View details for {borrowed.requestCode}">
								<div class="hidden md:flex items-center justify-center pt-0.5"><span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{rowNum}</span></div>
								<div class="min-w-0 pt-0.5"><p class="font-mono text-xs font-bold tracking-widest text-gray-900 truncate">{borrowed.requestCode}</p><p class="mt-1 text-[11px] text-gray-500">{new Date(borrowed.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(borrowed.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></div>
								<div class="min-w-0"><div class="flex flex-wrap gap-1.5 mb-1.5">{#each borrowed.items.slice(0,3) as item}{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">{#if pic}<img src={pic} alt={item.name} class="h-3.5 w-3.5 rounded object-cover shrink-0" onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute('style'); }} /><span class="h-3.5 w-3.5 shrink-0 overflow-hidden rounded" style="display:none"><ItemImagePlaceholder size="xs" /></span>{:else}<span class="h-3.5 w-3.5 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>{/if}<span class="truncate max-w-22.5">{item.name}</span></span>{/each}{#if borrowed.items.length > 3}<span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">+{borrowed.items.length - 3}</span>{/if}</div><p class="truncate text-xs text-gray-500"><span class="font-medium text-gray-700">Purpose:</span> {borrowed.purpose}</p><p class="mt-0.5 truncate text-[11px] text-gray-400">Instructor: {borrowed.instructorName}</p></div>
								<div class="min-w-0"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {getBorrowedBadgeClasses(borrowed)}">{getBorrowedStateLabel(borrowed)}</span></div>
								<div class="flex items-center justify-end gap-2 pt-0.5 shrink-0">
									{#if borrowed.status === 'borrowed'}
										<button onclick={(e) => { e.stopPropagation(); qrBorrowed = borrowed; qrDataUrl = null; QRCode.toDataURL(borrowed.id, { width: 240, margin: 2, color: { dark: '#111827', light: '#ffffff' }, errorCorrectionLevel: 'H' }).then(url => { qrDataUrl = url; }).catch(() => {}); showQrModal = true; }} class="inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-full border border-pink-200 bg-white text-pink-600 shadow-sm transition-colors hover:bg-pink-50" title="View QR Code">
											<QrCode size={14} strokeWidth={2} />
										</button>
										<span class="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 px-4 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">Return confirmed by custodian</span>
									{:else}
										<a onclick={(e) => e.stopPropagation()} href="/student/requests" class="inline-flex shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50">Track Request</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
		{:else if viewMode === 'by-item'}
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[32px_1.5fr_1.2fr_1fr_1.2fr] md:items-center md:gap-4">
					<span class="text-center text-gray-400">#</span>
					<span>Item Details</span>
					<span>Request & Due</span>
					<span>Instructor</span>
					<span>Status</span>
				</div>
				<div class="divide-y divide-gray-100">
					{#if paginatedItemRows.length === 0}
						<div class="px-4 py-8 text-center text-sm text-gray-500">
							No items match the current search or filter.
						</div>
					{:else}
						{#each paginatedItemRows as row, i}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="grid gap-3 p-4 md:grid-cols-[32px_1.5fr_1.2fr_1fr_1.2fr] md:items-start md:gap-4 transition-colors cursor-pointer hover:bg-gray-50"
								onclick={() => { const _borrowed = borrowedRequests.find(b => b.id === row.requestId); if (_borrowed) openBorrowedDetails(_borrowed); }}
								role="button"
								tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && (() => { const _borrowed = borrowedRequests.find(b => b.id === row.requestId); if (_borrowed) openBorrowedDetails(_borrowed); })()}
							>
								<div class="hidden md:flex items-center justify-center pt-0.5">
									<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{(currentPage - 1) * PAGE_SIZE_BY_ITEM + i + 1}</span>
								</div>
								
								<div class="flex items-start gap-3 min-w-0">
									{#if row.picture}
										<img src={row.picture} alt={row.itemName} class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-100" loading="lazy" onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute('style'); }} />
										<span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50 ring-1 ring-gray-100" style="display:none"><ItemImagePlaceholder size="sm" /></span>
									{:else}
										<span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50 ring-1 ring-gray-100"><ItemImagePlaceholder size="sm" /></span>
									{/if}
									<div class="min-w-0 pt-0.5">
										<p class="truncate text-sm font-semibold text-gray-900">{row.itemName}</p>
										<p class="mt-0.5 text-[11px] font-medium text-gray-500">Qty: {row.quantity}</p>
									</div>
								</div>

								<div class="min-w-0 pt-0.5">
									<p class="font-mono text-xs font-bold tracking-widest text-gray-900 truncate">{row.requestCode}</p>
									<div class="mt-1 flex flex-col gap-0.5">
										<p class="text-[11px] text-gray-500">Due {new Date(row.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
										<p class="text-[11px] {row.isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}">
											{row.daysDelta < 0 ? `${Math.abs(row.daysDelta)} days overdue` : `${row.daysDelta} days left`}
										</p>
									</div>
								</div>

								<div class="min-w-0 pt-0.5">
									<p class="truncate text-sm font-medium text-gray-700">{row.instructorName}</p>
								</div>

								<div class="min-w-0 flex flex-col items-start gap-1.5 pt-0.5">
									<span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 {getItemStatusClasses(row.status)}">
										{getItemStatusLabel(row.status)}
									</span>
									{#if row.settlementLabel && !['N/A', 'None', '-'].includes(row.settlementLabel)}
										<span class="inline-flex items-center rounded bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200">
											Rep: {row.settlementLabel}
										</span>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
		</div>

		{#if !isLoading && totalEntries > 0 && totalPages > 1}
			<Pagination
				{currentPage}
				{totalPages}
				totalItems={totalEntries}
				itemsPerPage={currentPageSize}
				onPageChange={(p) => { currentPage = p; }}
				class="mt-4"
			/>
		{/if}
	</div>
		</div>
	</div>

	{#if showQrModal && selectedBorrowed}
		<div class="fixed inset-0 z-60 overflow-y-auto">
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
				onclick={() => showQrModal = false}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') showQrModal = false; }}
				aria-label="Close QR modal"
			></div>
			<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
				<div class="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 animate-scaleIn overflow-hidden">

					<!-- Header -->
					<div class="relative border-b border-gray-100 bg-linear-to-br from-pink-50 via-white to-purple-50 px-5 py-5 sm:px-6 sm:py-6">
						<div>
							<div class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-gray-100">
								<QrCode size={16} class="text-pink-600" strokeWidth={2.5} />
								<span class="text-sm font-semibold text-gray-700">QR Code</span>
							</div>
							<h3 class="mt-3 text-lg sm:text-xl font-bold text-gray-900">Scan to Process</h3>
							<p class="mt-1 text-xs sm:text-sm text-gray-600">Present this code to the custodian</p>
						</div>
					</div>

					<!-- Content -->
					<div class="px-5 py-6 sm:px-6 sm:py-8 max-h-[70vh] overflow-y-auto">
						<div class="flex flex-col items-center space-y-5 sm:space-y-6">
							<!-- QR Code with decorative frame -->
							<div class="relative">
								<!-- Decorative corners -->
								<div class="absolute -left-2 -top-2 h-5 w-5 sm:h-6 sm:w-6 border-l-3 border-t-3 border-pink-500 rounded-tl-lg"></div>
								<div class="absolute -right-2 -top-2 h-5 w-5 sm:h-6 sm:w-6 border-r-3 border-t-3 border-pink-500 rounded-tr-lg"></div>
								<div class="absolute -left-2 -bottom-2 h-5 w-5 sm:h-6 sm:w-6 border-l-3 border-b-3 border-pink-500 rounded-bl-lg"></div>
								<div class="absolute -right-2 -bottom-2 h-5 w-5 sm:h-6 sm:w-6 border-r-3 border-b-3 border-pink-500 rounded-br-lg"></div>

								<!-- QR Code -->
								<div class="rounded-2xl bg-white p-4 sm:p-6 shadow-lg ring-1 ring-gray-100">
									{#if qrDataUrl}
										<img src={qrDataUrl} alt="Request QR Code" class="h-48 w-48 sm:h-56 sm:w-56" />
									{:else}
										<div class="flex h-48 w-48 sm:h-56 sm:w-56 items-center justify-center">
											<span class="text-sm font-medium text-gray-400 animate-pulse">Generating...</span>
										</div>
									{/if}
								</div>
							</div>

							<!-- Request ID Badge -->
							<div class="w-full rounded-xl bg-linear-to-br from-gray-50 to-gray-100/50 p-3 sm:p-4 text-center ring-1 ring-gray-200/50">
								<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1 sm:mb-1.5">Request ID</p>
								<p class="font-mono text-xl sm:text-2xl font-bold tracking-wider text-gray-900">{selectedBorrowed.requestCode}</p>
							</div>

							<!-- Status Badge -->
							<div class="inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 {getBorrowedBadgeClasses(selectedBorrowed)} ring-1 ring-black/5">
								<span class="text-xs sm:text-sm font-semibold">{getBorrowedStateLabel(selectedBorrowed)}</span>
							</div>

							<!-- Instructions Card -->
							<div class="w-full rounded-xl border border-blue-200 bg-linear-to-br from-blue-50 to-blue-100/30 p-3 sm:p-4">
								<div class="flex gap-2.5 sm:gap-3">
									<div class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
										<AlertCircle size={14} class="text-white sm:hidden" />
										<AlertCircle size={16} class="text-white hidden sm:block" />
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-xs sm:text-sm font-medium text-blue-900 leading-relaxed">
											Show this QR code to the custodian when returning your borrowed items.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Footer -->
					<div class="border-t border-gray-100 bg-linear-to-br from-gray-50 to-white px-5 py-4 sm:px-6 sm:py-5">
						<button
							onclick={() => (showQrModal = false)}
							class="w-full rounded-xl bg-linear-to-r from-gray-900 to-gray-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-gray-800 hover:to-gray-700 active:scale-[0.98]"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if selectedBorrowed}
		<!-- Modal Container -->
		<div class="fixed inset-0 z-50 overflow-y-auto">
			<!-- Backdrop -->
			<button
				type="button"
				class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
				onclick={closeBorrowedDetails}
				aria-label="Close borrowed details modal"
				tabindex="-1"
			></button>
			
			<!-- Modal -->
			<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
				<div
					class="animate-scaleIn relative w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
					role="dialog"
					aria-labelledby="borrowing-modal-title"
					aria-modal="true"
				>
					<!-- Header -->
					<div
						class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-8 sm:py-6"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex items-start gap-3 sm:gap-4">
								<!-- Icon -->
								<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-14 sm:w-14 sm:rounded-2xl lg:h-16 lg:w-16">
									<Package class="h-6 w-6 text-white sm:h-7 sm:w-7 lg:h-8 lg:w-8" strokeWidth={2.5} />
								</div>
								
								<div class="min-w-0 flex-1">
									<h2 id="borrowing-modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">Request Details</h2>
									<p class="mt-0.5 font-mono text-xs font-semibold text-pink-600 sm:text-sm">{selectedBorrowed.requestCode}</p>
									<div
										class="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 {getDetailModalStatusColor(
											selectedBorrowed
										)} shadow-sm ring-1 ring-black/5"
									>
										<SelectedStatusIcon size={12} strokeWidth={2.5} class="sm:hidden" />
										<SelectedStatusIcon size={14} strokeWidth={2.5} class="hidden sm:block" />
										<span class="text-[10px] font-bold sm:text-xs"
											>{getDetailModalStatusLabel(selectedBorrowed)}</span
										>
									</div>
								</div>
							</div>

							<div class="flex items-center gap-1.5 shrink-0">
								{#if selectedBorrowed.status === 'borrowed'}
									<button
										type="button"
										onclick={() => { qrBorrowed = selectedBorrowed; qrDataUrl = null; QRCode.toDataURL(selectedBorrowed!.id, { width: 240, margin: 2, color: { dark: '#111827', light: '#ffffff' }, errorCorrectionLevel: 'H' }).then(url => { qrDataUrl = url; }).catch(() => {}); showQrModal = true; }}
										class="shrink-0 rounded-xl p-2 text-pink-600 transition-all hover:bg-pink-50 active:scale-95 sm:p-2.5"
										title="View QR Code"
										aria-label="View QR Code"
									>
										<QrCode size={18} strokeWidth={2} class="sm:hidden" />
										<QrCode size={22} strokeWidth={2} class="hidden sm:block" />
									</button>
								{/if}
								<button
									type="button"
									onclick={closeBorrowedDetails}
									class="shrink-0 rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:p-2.5"
									aria-label="Close modal"
								>
									<X size={18} class="sm:hidden" />
									<X size={22} class="hidden sm:block" />
								</button>
							</div>
						</div>
					</div>

					<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
						<div class="space-y-6 sm:space-y-8">
							<!-- Approval Timeline -->
							<div>
								<div class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5">
									<!-- Timeline Container -->
									<div class="relative">
										<!-- SVG Background for connector lines -->
										<svg class="pointer-events-none absolute inset-0 h-16 w-full" style="z-index: 0;">
											{#each getApprovalTimeline(selectedBorrowed) as step, idx}
												{@const stepCount = getApprovalTimeline(selectedBorrowed).length}
												{@const isLastStep = idx === stepCount - 1}
												{@const stepWidth = 100 / stepCount}
												{@const x1 = stepWidth * (idx + 0.5)}
												{@const x2 = stepWidth * (idx + 1.5)}
												{@const y = 20}
												{@const currentStep = step}
												{@const isCurrentCompleted = currentStep.status === 'completed'}

												{#if !isLastStep}
													<line
														x1="{x1}%"
														y1={y}
														x2="{x2}%"
														y2={y}
														stroke={isCurrentCompleted ? '#ec4899' : '#e5e7eb'}
														stroke-width="2"
														stroke-linecap="round"
													/>
												{/if}
											{/each}
										</svg>

										<!-- Timeline steps -->
										<div class="relative flex items-start justify-between gap-1 sm:gap-2" style="z-index: 1;">
											{#each getApprovalTimeline(selectedBorrowed) as step, idx}
												{@const isCompleted = step.status === 'completed'}
												{@const isPending = step.status === 'pending'}
												{@const isCancelled = step.status === 'cancelled'}
												{@const isRejected = step.status === 'rejected'}

												<div class="flex flex-1 flex-col items-center">
													<!-- Icon Circle -->
													<div class="relative mb-2 flex items-center justify-center">
														<div
															class="flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white sm:h-12 sm:w-12 {isCompleted
																? 'border-pink-600'
																: isCancelled
																	? 'border-slate-400'
																	: isRejected
																		? 'border-red-600'
																: 'border-gray-300'}"
														>
															{#if step.step === 'Request Submitted'}
																<FileCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
																<FileCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
															{:else if step.step === 'Approved'}
																<CheckCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
																<CheckCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
															{:else if step.step === 'Custodian Approved'}
																<PackageCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
																<PackageCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
															{:else if step.step === 'Pickup Confirmed'}
																<Truck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
																<Truck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
															{:else if step.step === 'Awaiting Return' || step.step === 'Returned'}
																<Home size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
																<Home size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
															{:else if step.step === 'Item Missing' || step.step === 'Item Damaged' || step.step === 'Unresolved Incidents'}
																<CircleX size={18} class="text-red-600 sm:hidden" />
																<CircleX size={20} class="hidden text-red-600 sm:block" />
															{:else}
																<Clock size={18} class="animate-pulse text-gray-400 sm:hidden" />
																<Clock size={20} class="hidden animate-pulse text-gray-400 sm:block" />
															{/if}
														</div>
													</div>

													<!-- Step Label -->
													<div class="min-w-0 text-center">
														<p class="line-clamp-2 text-[10px] leading-tight font-semibold text-gray-900 sm:text-xs">
															{step.step}
														</p>
														<p class="mt-0.5 line-clamp-1 text-[9px] text-gray-500 sm:text-xs">
															{step.by}
														</p>
														<p class="text-[9px] font-medium sm:text-xs {isCompleted ? 'text-pink-600' : isCancelled ? 'text-slate-500' : isRejected ? 'text-red-600' : 'text-gray-400'} mt-0.5">
															{#if step.date}
																{new Date(step.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
															{:else}
																Pending
															{/if}
														</p>
													</div>
												</div>
											{/each}
										</div>
									</div>

									<!-- Status Legend -->
									<div class="mt-4 flex flex-wrap justify-center gap-3 border-t border-gray-200 pt-3 text-[10px] sm:text-xs">
										<div class="flex items-center gap-1.5">
											<div class="h-2 w-2 rounded-full bg-pink-600"></div>
											<span class="text-gray-600">Completed</span>
										</div>
										<div class="flex items-center gap-1.5">
											<div class="h-2 w-2 rounded-full bg-gray-300"></div>
											<span class="text-gray-600">Pending</span>
										</div>
										<div class="flex items-center gap-1.5">
											<div class="h-2 w-2 rounded-full bg-red-600"></div>
											<span class="text-gray-600">Declined</span>
										</div>
										<div class="flex items-center gap-1.5">
											<div class="h-2 w-2 rounded-full bg-slate-400"></div>
											<span class="text-gray-600">Cancelled</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Request Information -->
							<div>
								<h3
									class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
								>
									<div class="h-1 w-1 rounded-full bg-pink-500"></div>
									Request Information
								</h3>
								<div class="grid grid-cols-2 gap-3 sm:gap-4">
									<div
										class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<CalendarDays size={14} class="text-pink-500 sm:hidden" />
											<CalendarDays size={16} class="hidden text-pink-500 sm:block" />
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Request Date
											</p>
										</div>
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{new Date(selectedBorrowed.requestDate).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}
										</p>
									</div>
									<div
										class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<CalendarDays size={14} class="text-pink-500 sm:hidden" />
											<CalendarDays size={16} class="hidden text-pink-500 sm:block" />
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Borrow Period
											</p>
										</div>
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{new Date(selectedBorrowed.borrowDate).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric'
											})} – {new Date(selectedBorrowed.returnDate).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}
										</p>
									</div>
									<div
										class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<BookOpen size={14} class="text-pink-500 sm:hidden" />
											<BookOpen size={16} class="hidden text-pink-500 sm:block" />
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Class Code
											</p>
										</div>
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{selectedBorrowed.classCodeString}
										</p>
										<p class="mt-0.5 truncate text-[10px] text-gray-500 sm:text-xs">
											{selectedBorrowed.classSubjectString}
										</p>
									</div>
									<div
										class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<UserCircle size={14} class="text-pink-500 sm:hidden" />
											<UserCircle size={16} class="hidden text-pink-500 sm:block" />
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Instructor
											</p>
										</div>
										<div class="flex items-center gap-2.5">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200"
											>
												{#if selectedBorrowed.instructorPhoto}
													<img
														src={selectedBorrowed.instructorPhoto}
														alt={selectedBorrowed.instructorName}
														class="h-full w-full object-cover"
														loading="lazy"
													/>
												{:else}
													{selectedBorrowed.instructorName.charAt(0).toUpperCase()}
												{/if}
											</div>
											<p class="text-sm font-bold text-gray-900 sm:text-base">
												{selectedBorrowed.instructorName}
											</p>
										</div>
									</div>
									{#if selectedBorrowed.custodianName && selectedBorrowed.custodianName !== 'Pending Custodian'}
										<div
											class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
										>
											<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
												<UserCircle size={14} class="text-pink-500 sm:hidden" />
												<UserCircle size={16} class="hidden text-pink-500 sm:block" />
												<p
													class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
												>
													Custodian
												</p>
											</div>
											<div class="flex items-center gap-2.5">
												<div
													class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200"
												>
													{#if selectedBorrowed.custodianPhoto}
														<img
															src={selectedBorrowed.custodianPhoto}
															alt={selectedBorrowed.custodianName}
															class="h-full w-full object-cover"
															loading="lazy"
														/>
													{:else}
														{selectedBorrowed.custodianName.charAt(0).toUpperCase()}
													{/if}
												</div>
												<p class="text-sm font-bold text-gray-900 sm:text-base">
													{selectedBorrowed.custodianName}
												</p>
											</div>
										</div>
									{/if}
									<div
										class="group col-span-2 rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<FileText size={14} class="text-pink-500 sm:hidden" />
											<FileText size={16} class="hidden text-pink-500 sm:block" />
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Purpose
											</p>
										</div>
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{selectedBorrowed.purpose}
										</p>
									</div>
								</div>
							</div>

							<!-- Requested Items -->
							<div>
								<h3 class="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
									<div class="h-1 w-1 rounded-full bg-pink-500"></div>
									Requested Items
								</h3>
								<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
									<!-- Desktop Table Header -->
									<div class="hidden sm:grid grid-cols-12 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
										<span class="col-span-8">Item</span>
										<span class="col-span-2 text-center">Code</span>
										<span class="col-span-2 text-center">Qty</span>
									</div>
									
									<!-- Table Rows -->
									<div class="divide-y divide-gray-100">
										{#each selectedBorrowed.items as item}
											{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
											{@const code = item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A'}
											<div class="grid items-center gap-3 bg-white p-3 sm:grid-cols-12 sm:p-4 transition-colors hover:bg-gray-50/50">
												<!-- Item Info -->
												<div class="col-span-12 flex items-center gap-3 sm:col-span-8 min-w-0">
													{#if pic}
														<img
															src={pic}
															alt={item.name}
															class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
															loading="lazy"
														/>
													{:else}
														<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-200">
															<ItemImagePlaceholder size="sm" />
														</div>
													{/if}
													<div class="flex flex-col gap-1 min-w-0">
														<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
														
														{#if item.inspection}
															{@const isGood = item.inspection.status === 'good'}
															{@const isDamaged = item.inspection.status === 'damaged'}
															{@const isMissing = item.inspection.status === 'missing'}
															<div class="flex flex-wrap items-center gap-1.5 mt-0.5">
																{#if isGood}
																	<span class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200/50">
																		<span class="h-1 w-1 rounded-full bg-emerald-500"></span>
																		Good
																	</span>
																{/if}
																{#if isDamaged}
																	<span class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 ring-1 ring-amber-200/50">
																		<span class="h-1 w-1 rounded-full bg-amber-500"></span>
																		Damaged
																	</span>
																{/if}
																{#if isMissing}
																	<span class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 ring-1 ring-rose-200/50">
																		<span class="h-1 w-1 rounded-full bg-rose-500"></span>
																		Missing
																	</span>
																{/if}
															</div>
														{/if}
													</div>
												</div>
												
												<!-- Mobile/Desktop Details -->
												<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
													<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden">Code</span>
													<span class="font-mono text-sm font-medium text-gray-600">{code}</span>
												</div>
												<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0 border-l border-gray-100 pl-3 sm:border-0 sm:pl-0">
													<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden">Qty</span>
													<span class="text-sm font-bold text-gray-900 tabular-nums">{item.quantity}</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>

							<!-- Overdue Banner -->
							{#if selectedBorrowed.isOverdue}
								<div
									class="rounded-2xl border-2 border-red-200 bg-linear-to-br from-red-50 to-red-100/50 p-5"
								>
									<div class="flex gap-3">
										<div
											class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500"
										>
											<CircleAlert size={20} class="text-white" />
										</div>
										<div class="min-w-0 flex-1">
											<p class="text-sm font-bold text-red-900">Overdue Notification</p>
											<p class="mt-1.5 text-sm leading-relaxed text-red-800">
												This borrowing is overdue by {Math.abs(selectedBorrowed.daysDelta)} day{Math.abs(selectedBorrowed.daysDelta) > 1 ? 's' : ''}. Please proceed to the custodian desk immediately.
											</p>
											<p class="mt-1 text-xs text-red-600">
												Due date: {new Date(selectedBorrowed.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
											</p>
										</div>
									</div>
								</div>
							{/if}

							<!-- Replacement Obligations Table -->
							{#if selectedBorrowed.items.some((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0)}
								<div class="mt-8 animate-fadeIn">
									<h3 class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
										<div class="h-1 w-1 rounded-full bg-amber-500"></div>
										Replacement Obligations
									</h3>
									<div class="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
										<!-- Desktop Table Header -->
										<div class="hidden sm:grid grid-cols-12 border-b border-amber-100 bg-amber-50/50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-amber-900 uppercase">
											<span class="col-span-6">Item to Replace</span>
											<span class="col-span-3 text-center">Qty Required</span>
											<span class="col-span-3 text-right">Due Date</span>
										</div>
										
										<!-- Table Rows -->
										<div class="divide-y divide-amber-100/50">
											{#each selectedBorrowed.items.filter((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0) as item}
												{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
												{@const code = item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A'}
												<div class="grid items-center gap-3 bg-white p-3 sm:grid-cols-12 sm:p-4 hover:bg-amber-50/30 transition-colors">
													<div class="col-span-12 flex items-center gap-3 sm:col-span-6 min-w-0">
														{#if pic}
															<img src={pic} alt={item.name} class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-amber-200/50" loading="lazy" />
														{:else}
															<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-amber-200/50 text-amber-500/50">
																<ItemImagePlaceholder size="sm" />
															</div>
														{/if}
														<div class="flex flex-col gap-1 min-w-0">
															<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
															<span class="text-[10px] font-semibold text-amber-600/80 uppercase">{code}</span>
															{#if item.inspection?.notes?.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
																<span class="text-[11px] leading-relaxed text-amber-855 bg-amber-50/50 border border-amber-250/30 rounded-lg px-2.5 py-1 mt-1 font-medium w-fit max-w-full shadow-xs">
																	<span class="font-bold text-amber-955">Note:</span> {item.inspection.notes.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
																</span>
															{/if}
														</div>
													</div>
													<div class="col-span-6 flex items-center justify-between sm:col-span-3 sm:justify-center border-t border-amber-100/50 pt-3 sm:border-0 sm:pt-0">
														<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden">Qty Required</span>
														<span class="text-sm font-bold text-amber-700 tabular-nums">{item.inspection?.replacementQuantity}</span>
													</div>
													<div class="col-span-6 flex items-center justify-between sm:col-span-3 sm:justify-end border-t border-amber-100/50 pt-3 sm:border-0 sm:pt-0 border-l border-amber-100/50 pl-3 sm:border-0 sm:pl-0">
														<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden">Due Date</span>
														<span class="text-xs font-semibold text-gray-700">
															{item.inspection?.dueDate ? new Date(item.inspection.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
														</span>
													</div>
												</div>
											{/each}
										</div>
									</div>
								</div>
							{/if}
							</div>
						</div>

					<!-- Footer -->
					{#if selectedBorrowed.hasUnresolvedIssue}
						<div
							class="safe-area-bottom sticky bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3.5 backdrop-blur-sm sm:px-8 sm:py-4"
						>
							<div class="rounded-lg border border-pink-200 bg-pink-50 px-4 py-2.5 text-xs animate-fadeIn text-center sm:text-left">
								<div class="font-bold text-pink-800">An unresolved incident is attached to this request.</div>
								<div class="mt-0.5 text-pink-700">Coordinate with the custodian to resolve the outstanding case.</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- QR Code Modal -->
	{#if showQrModal && qrBorrowed}
		<div class="fixed inset-0 z-60 overflow-y-auto">
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
				onclick={() => (showQrModal = false)}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') showQrModal = false; }}
				aria-label="Close QR modal"
			></div>
			<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
				<div class="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 animate-scaleIn overflow-hidden">

					<!-- Header -->
					<div class="relative border-b border-gray-100 bg-linear-to-br from-pink-50 via-white to-purple-50 px-5 py-5 sm:px-6 sm:py-6">
						<div>
							<div class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-gray-100">
								<QrCode size={16} class="text-pink-600" strokeWidth={2.5} />
								<span class="text-sm font-semibold text-gray-700">QR Code</span>
							</div>
							<h3 class="mt-3 text-lg sm:text-xl font-bold text-gray-900">Scan to Process</h3>
							<p class="mt-1 text-xs sm:text-sm text-gray-600">Present this code to the custodian</p>
						</div>
					</div>

					<!-- Content -->
					<div class="px-5 py-6 sm:px-6 sm:py-8 max-h-[70vh] overflow-y-auto">
						<div class="flex flex-col items-center space-y-5 sm:space-y-6">
							<!-- QR Code with decorative frame -->
							<div class="relative">
								<!-- Decorative corners -->
								<div class="absolute -left-2 -top-2 h-5 w-5 sm:h-6 sm:w-6 border-l-3 border-t-3 border-pink-500 rounded-tl-lg"></div>
								<div class="absolute -right-2 -top-2 h-5 w-5 sm:h-6 sm:w-6 border-r-3 border-t-3 border-pink-500 rounded-tr-lg"></div>
								<div class="absolute -left-2 -bottom-2 h-5 w-5 sm:h-6 sm:w-6 border-l-3 border-b-3 border-pink-500 rounded-bl-lg"></div>
								<div class="absolute -right-2 -bottom-2 h-5 w-5 sm:h-6 sm:w-6 border-r-3 border-b-3 border-pink-500 rounded-br-lg"></div>
								<!-- QR Image -->
								<div class="rounded-2xl bg-white p-4 sm:p-6 shadow-lg ring-1 ring-gray-100">
									{#if qrDataUrl}
										<img src={qrDataUrl} alt="Request QR Code" class="h-48 w-48 sm:h-56 sm:w-56" />
									{:else}
										<div class="flex h-48 w-48 sm:h-56 sm:w-56 items-center justify-center">
											<span class="text-sm font-medium text-gray-400 animate-pulse">Generating...</span>
										</div>
									{/if}
								</div>
							</div>

							<!-- Request ID Badge -->
							<div class="w-full rounded-xl bg-linear-to-br from-gray-50 to-gray-100/50 p-3 sm:p-4 text-center ring-1 ring-gray-200/50">
								<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1 sm:mb-1.5">Request ID</p>
								<p class="font-mono text-xl sm:text-2xl font-bold tracking-wider text-gray-900">{qrBorrowed.requestCode}</p>
							</div>

							<!-- Status Badge -->
							<div class="inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 ring-1 ring-black/5 {getBorrowedBadgeClasses(qrBorrowed)}">
								<span class="text-xs sm:text-sm font-semibold">{getBorrowedStateLabel(qrBorrowed)}</span>
							</div>

							<!-- Instructions Card -->
							<div class="w-full rounded-xl border border-blue-200 bg-linear-to-br from-blue-50 to-blue-100/30 p-3 sm:p-4">
								<div class="flex gap-2.5 sm:gap-3">
									<div class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
										<AlertCircle size={14} class="text-white sm:hidden" />
										<AlertCircle size={16} class="text-white hidden sm:block" />
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-xs sm:text-sm font-medium text-blue-900 leading-relaxed">
											Show this QR code to the custodian when returning your borrowed items.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Footer -->
					<div class="border-t border-gray-100 bg-linear-to-br from-gray-50 to-white px-5 py-4 sm:px-6 sm:py-5">
						<button
							onclick={() => (showQrModal = false)}
							class="w-full rounded-xl bg-linear-to-r from-gray-900 to-gray-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-gray-800 hover:to-gray-700 active:scale-[0.98]"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>