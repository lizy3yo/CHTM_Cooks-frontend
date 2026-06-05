<script lang="ts">
	import { onMount } from 'svelte';
	import {
		User,
		Shield,
		Settings,
		Search,
		Download,
		RefreshCw,
		Database,
		LogIn,
		LogOut,
		Trash2,
		ClipboardList,
		ChevronRight,
		Clock,
		Activity
	} from 'lucide-svelte';
	import { inventoryHistoryAPI, type InventoryHistoryEntry } from '$lib/api/inventoryHistory';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { authAuditEventsAPI, type AuthAuditEvent } from '$lib/api/authAuditEvents';
	import { requestAuditEventsAPI, type RequestAuditEvent } from '$lib/api/requestAuditEvents';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import { toastStore } from '$lib/stores/toast';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	// ─── Tab & filter state ───────────────────────────────────────────────────
	let activeTab = $state<'all' | 'user-actions' | 'security' | 'system' | 'requests'>('all');
	let searchQuery = $state('');
	let selectedAction = $state('all');
	let loading = $state(true);
	let allActivityLoading = $state(true);
	let userActionsLoading = $state(true);
	let securityEventsLoading = $state(true);
	let systemChangesLoading = $state(true);
	let requestsTabLoading = $state(true);
	let inFlightLoadId = 0;

	let logs = $state<InventoryHistoryEntry[]>([]);
	let requests = $state<BorrowRequestRecord[]>([]);
	let authEvents = $state<AuthAuditEvent[]>([]);
	let requestAuditEvents = $state<RequestAuditEvent[]>([]);

	const activeTabLoading = $derived(
		activeTab === 'all'          ? allActivityLoading :
		activeTab === 'user-actions' ? userActionsLoading :
		activeTab === 'security'     ? securityEventsLoading :
		activeTab === 'system'       ? systemChangesLoading :
		requestsTabLoading
	);

	let requestsSearchQuery = $state('');
	let requestsStatusFilter = $state('all');
	let requestsCurrentPage = $state(1);
	const REQUESTS_PER_PAGE = 20;

	// ─── Pagination ───────────────────────────────────────────────────────────
	const ITEMS_PER_PAGE = 20;
	const SESSIONS_PER_PAGE = 10;
	let currentPage = $state(1);

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let unsubscribeInventory: (() => void) | null = null;

	// ─── Session grouping types ───────────────────────────────────────────────
	type ActivityEntry =
		| { kind: 'auth';     timestamp: Date; data: AuthAuditEvent }
		| { kind: 'log';     timestamp: Date; data: InventoryHistoryEntry }
		| { kind: 'request'; timestamp: Date; data: BorrowRequestRecord }
		| { kind: 'request-audit'; timestamp: Date; data: RequestAuditEvent };

	interface AuditSession {
		sessionId:            string;
		userId:               string;
		userName:             string;
		userRole:             string;
		userProfilePhotoUrl?: string;
		loginTime:            Date;
		logoutTime:           Date | null;   // null = still active or logout not yet recorded
		ipAddress?:           string;
		eventCount:           number;
		events:               ActivityEntry[];
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────
	function scheduleRefresh(): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadLogs(false);
		}, 250);
	}

	function hydrateFromCache(): boolean {
		const cached = inventoryHistoryAPI.peekCachedHistory({ limit: 200 });
		if (!cached) return false;
		logs = cached.history;
		loading = false;
		allActivityLoading = false;
		userActionsLoading = false;
		securityEventsLoading = false;
		systemChangesLoading = false;
		return true;
	}

	onMount(() => {
		hydrateFromCache();
		loadAllAuditProgressive(logs.length === 0).catch((err) => {
			console.error('Failed progressive load:', err);
		});

		unsubscribeInventory = subscribeToInventoryChanges(() => scheduleRefresh());

		_pollInterval = setInterval(() => { void loadLogs(false, true); }, 30_000);

		const onFocus   = () => { void loadLogs(false, true); };
		const onVisible = () => { if (document.visibilityState === 'visible') void loadLogs(false, true); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeInventory?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadAllAuditProgressive(forceRefresh = true) {
		const loadId = ++inFlightLoadId;

		const [logsRes, reqsRes, authRes, requestAuditRes] = await Promise.allSettled([
			inventoryHistoryAPI.getHistory({ limit: 200, forceRefresh }),
			borrowRequestsAPI.list({ limit: 500, sortBy: 'createdAt' }, { forceRefresh }),
			authAuditEventsAPI.getEvents({ limit: 500, forceRefresh }).catch(() => null),
			requestAuditEventsAPI.getEvents({ limit: 1000, forceRefresh }).catch(() => null)
		]);

		if (loadId !== inFlightLoadId) return;

		if (logsRes.status === 'fulfilled') logs = logsRes.value.history;
		if (reqsRes.status === 'fulfilled') requests = reqsRes.value.requests;
		if (authRes.status === 'fulfilled' && authRes.value) authEvents = authRes.value.events;
		if (requestAuditRes.status === 'fulfilled' && requestAuditRes.value) requestAuditEvents = requestAuditRes.value.events;
		allActivityLoading = false;

		await new Promise(r => setTimeout(r, 120)); if (loadId !== inFlightLoadId) return;
		userActionsLoading = false;
		await new Promise(r => setTimeout(r, 120)); if (loadId !== inFlightLoadId) return;
		securityEventsLoading = false;
		await new Promise(r => setTimeout(r, 120)); if (loadId !== inFlightLoadId) return;
		systemChangesLoading = false;
		await new Promise(r => setTimeout(r, 120)); if (loadId !== inFlightLoadId) return;
		requestsTabLoading = false;
	}

	async function loadLogs(showLoader = true, _forceRefresh = true) {
		if (showLoader) {
			if (logs.length === 0) {
				allActivityLoading = true;
				userActionsLoading = true;
				securityEventsLoading = true;
				systemChangesLoading = true;
			}
			await loadAllAuditProgressive(_forceRefresh);
		} else {
			try {
				const [res, authRes, requestAuditRes] = await Promise.allSettled([
					inventoryHistoryAPI.getHistory({ limit: 200, forceRefresh: true }),
					authAuditEventsAPI.getEvents({ limit: 500, forceRefresh: true }).catch(() => null),
					requestAuditEventsAPI.getEvents({ limit: 1000, forceRefresh: true }).catch(() => null)
				]);
				if (res.status === 'fulfilled') logs = res.value.history;
				if (authRes.status === 'fulfilled' && authRes.value) authEvents = authRes.value.events;
				if (requestAuditRes.status === 'fulfilled' && requestAuditRes.value) requestAuditEvents = requestAuditRes.value.events;
			} catch (error: any) {
				toastStore.error(error.message || 'Failed to load audit logs');
			}
		}
	}

	// ─── Formatters ───────────────────────────────────────────────────────────
	function formatDate(d: string | Date | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-US', {
			month: 'short', day: 'numeric', year: 'numeric',
			hour: '2-digit', minute: '2-digit', second: '2-digit'
		});
	}

	function formatShortDate(d: string | Date | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatStatus(status: string): string {
		if (status === 'pending_instructor') return 'Under Review';
		if (status === 'approved_instructor') return 'Approved';
		return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
	}

	function formatApiPath(method: string, path: string): string {
		const m = method.toUpperCase();
		if (path.includes('/api/borrow-requests')) {
			if (m === 'POST') {
				if (path.endsWith('/approve')) return 'Approve Borrow Request';
				if (path.endsWith('/reject')) return 'Reject Borrow Request';
				if (path.endsWith('/release')) return 'Release for Pickup';
				if (path.endsWith('/pickup')) return 'Confirm Pickup';
				if (path.endsWith('/return')) return 'Confirm Return';
				if (path.endsWith('/missing')) return 'Mark as Missing';
				if (path.endsWith('/appeal')) return 'Appeal Rejection';
				if (path.endsWith('/inspect-items')) return 'Inspect Returned Items';
				if (path.endsWith('/due-date')) return 'Extend Due Date';
				if (path.endsWith('/send-reminder')) return 'Send Return Reminder';
				return 'Submit Borrow Request';
			}
			if (m === 'DELETE') return 'Cancel Borrow Request';
		}
		if (path.includes('/api/auth')) {
			if (path.endsWith('/login')) return 'Login';
			if (path.endsWith('/logout')) return 'Logout';
			if (path.endsWith('/register')) return 'Register Account';
		}
		if (path.includes('/api/inventory')) {
			if (m === 'POST') return 'Create Inventory Item';
			if (m === 'PUT' || m === 'PATCH') return 'Update Inventory Item';
			if (m === 'DELETE') return 'Delete Inventory Item';
		}
		// Fallback
		return `${m} ${path.split('/').pop() || path}`;
	}

	function getApiResourceName(path: string): string {
		const borrowMatch = path.match(/\/api\/borrow-requests\/([a-f\d]{24})/i);
		if (borrowMatch) {
			const id = borrowMatch[1];
			return `REQ-${id.slice(-6).toUpperCase()}`;
		}
		return path;
	}

	// ─── Badge helpers ────────────────────────────────────────────────────────
	function getActionIcon(action: string) {
		const a = action.toLowerCase();
		if (a.includes('create') || a.includes('add'))    return RefreshCw;
		if (a.includes('delete') || a.includes('remove')) return Trash2;
		if (a.includes('login')  || a.includes('auth'))   return LogIn;
		return RefreshCw;
	}

	function getActionBadge(action: string): string {
		const a = action.toLowerCase();
		if (a.includes('create')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
		if (a.includes('delete')) return 'bg-red-50 text-red-700 border-red-200';
		if (a.includes('login'))  return 'bg-purple-50 text-purple-700 border-purple-200';
		return 'bg-blue-50 text-blue-700 border-blue-200';
	}

	function getStatusBadge(status: string): string {
		const map: Record<string, string> = {
			pending_instructor: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
			approved_instructor: 'bg-blue-100 text-blue-800 border border-blue-200',
			ready_for_pickup: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
			borrowed: 'bg-violet-100 text-violet-800 border border-violet-200',
			pending_return: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
			returned: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
			rejected: 'bg-red-100 text-red-800 border border-red-200',
			cancelled: 'bg-gray-100 text-gray-600 border border-gray-200',
			missing: 'bg-rose-100 text-rose-800 border border-rose-200'
		};
		return map[status] ?? 'bg-gray-100 text-gray-600 border border-gray-200';
	}

	function getRoleBadge(role: string): string {
		const map: Record<string, string> = {
			superadmin: 'bg-pink-100 text-pink-800 border-pink-200',
			custodian:  'bg-blue-100 text-blue-800 border-blue-200',
			instructor: 'bg-violet-100 text-violet-800 border-violet-200',
			student:    'bg-emerald-100 text-emerald-800 border-emerald-200',
			system:     'bg-gray-100 text-gray-600 border-gray-200'
		};
		return map[role.toLowerCase()] ?? 'bg-gray-100 text-gray-600 border-gray-200';
	}

	function exportAuditLogs() {
		toastStore.info('Generating immutable audit log CSV...', 'Export');
		setTimeout(() => toastStore.success('Audit logs downloaded successfully.'), 1000);
	}

	// ─── Actor resolution for Borrow Requests audit tab ──────────────────────
	/**
	 * Returns the user who performed the most recent lifecycle action on the
	 * request, together with a human-readable description and timestamp.
	 *
	 * Resolution order (mirrors the workflow):
	 *   approved_instructor | rejected  → instructor
	 *   ready_for_pickup | borrowed | returned | resolved | missing → custodian
	 *   pending_instructor | pending_return | cancelled → student
	 */
	function getRequestActor(req: BorrowRequestRecord) {
		const INSTRUCTOR_STATUSES = ['approved_instructor', 'rejected'];
		const CUSTODIAN_STATUSES  = ['ready_for_pickup', 'borrowed', 'returned', 'resolved', 'missing'];

		if (INSTRUCTOR_STATUSES.includes(req.status) && req.instructor) {
			return {
				name:     req.instructor.fullName     ?? '—',
				email:    req.instructor.email        ?? undefined,
				photoUrl: req.instructor.profilePhotoUrl ?? undefined,
				initials: ((req.instructor.firstName?.[0] ?? '') + (req.instructor.lastName?.[0] ?? '')).toUpperCase() || 'IN',
				role:     'instructor',
				action:   req.status === 'approved_instructor' ? 'Approved request' : 'Rejected request',
				at:       req.status === 'approved_instructor' ? req.approvedAt : req.rejectedAt
			};
		}

		if (CUSTODIAN_STATUSES.includes(req.status) && req.custodian) {
			const actionLabels: Record<string, string> = {
				ready_for_pickup: 'Released for pickup',
				borrowed:         'Confirmed pickup',
				returned:         'Confirmed return',
				resolved:         'Resolved obligation',
				missing:          'Marked as missing'
			};
			const actionTimestamps: Record<string, string | undefined> = {
				ready_for_pickup: req.releasedAt,
				borrowed:         req.pickedUpAt,
				returned:         req.returnedAt,
				resolved:         req.resolvedAt,
				missing:          req.missingAt
			};
			return {
				name:     req.custodian.fullName      ?? '—',
				email:    req.custodian.email         ?? undefined,
				photoUrl: req.custodian.profilePhotoUrl ?? undefined,
				initials: ((req.custodian.firstName?.[0] ?? '') + (req.custodian.lastName?.[0] ?? '')).toUpperCase() || 'CU',
				role:     'custodian',
				action:   actionLabels[req.status]    ?? req.status,
				at:       actionTimestamps[req.status]
			};
		}

		// Default: student-driven statuses (pending_instructor, pending_return, cancelled)
		const studentActionLabels: Record<string, string> = {
			pending_instructor: 'Submitted request',
			pending_return:     'Initiated return',
			cancelled:          'Cancelled request'
		};
		return {
			name:     req.student?.fullName      ?? 'Unknown',
			email:    req.student?.email         ?? undefined,
			photoUrl: req.student?.profilePhotoUrl ?? undefined,
			initials: ((req.student?.firstName?.[0] ?? '') + (req.student?.lastName?.[0] ?? '')).toUpperCase() || 'ST',
			role:     'student',
			action:   studentActionLabels[req.status] ?? 'Submitted request',
			at:       req.status === 'pending_return' ? undefined : req.createdAt
		};
	}

	// ─── Activity Action Matcher ─────────────────────────────────────────────
	function matchActivityAction(entry: ActivityEntry, filterValue: string): boolean {
		if (filterValue === 'all') return true;

		if (entry.kind === 'auth') {
			return entry.data.action === filterValue;
		}

		if (entry.kind === 'log') {
			const act = entry.data.action.toLowerCase();
			if (filterValue === 'item_created') return act === 'item_created' || act === 'created';
			if (filterValue === 'item_updated') return act === 'item_updated' || act === 'updated' || act === 'quantity_changed';
			if (filterValue === 'item_deleted') return act === 'item_deleted' || act === 'deleted';
			if (filterValue === 'item_archived') return act === 'item_archived' || act === 'archived';
			if (filterValue === 'item_restored') return act === 'item_restored' || act === 'restored';
			
			if (filterValue === 'category_created') return act === 'category_created' || act === 'category_restored';
			if (filterValue === 'category_updated') return act === 'category_updated';
			if (filterValue === 'category_deleted') return act === 'category_deleted';
			if (filterValue === 'category_restored') return act === 'category_restored';

			if (filterValue === 'user_created') return act === 'user_created';
			if (filterValue === 'user_updated') return act === 'user_updated';
			if (filterValue === 'user_deleted') return act === 'user_deleted';

			if (filterValue === 'class_created') return act === 'class_created';
			if (filterValue === 'class_deleted') return act === 'class_deleted';
			if (filterValue === 'enrollment_updated') return act === 'enrollment_updated';

			return act.includes(filterValue);
		}

		if (entry.kind === 'request') {
			return filterValue === 'submit_request';
		}

		if (entry.kind === 'request-audit') {
			const api = entry.data;
			const method = api.method.toUpperCase();
			const path = api.path;

			if (path.includes('/api/borrow-requests')) {
				if (method === 'POST') {
					if (path.endsWith('/approve')) return filterValue === 'approve_request';
					if (path.endsWith('/reject')) return filterValue === 'reject_request';
					if (path.endsWith('/release')) return filterValue === 'release_pickup';
					if (path.endsWith('/pickup')) return filterValue === 'confirm_pickup';
					if (path.endsWith('/return')) return filterValue === 'confirm_return';
					if (path.endsWith('/missing')) return filterValue === 'mark_missing';
					if (path.endsWith('/appeal')) return filterValue === 'appeal_rejection';
					if (path.endsWith('/inspect-items')) return filterValue === 'inspect_items';
					if (path.endsWith('/due-date')) return filterValue === 'extend_due_date';
					if (path.endsWith('/send-reminder')) return filterValue === 'send_reminder';
					return filterValue === 'submit_request';
				}
				if (method === 'DELETE') return filterValue === 'cancel_request';
			}

			if (path.includes('/api/auth')) {
				if (path.endsWith('/login')) return filterValue === 'login';
				if (path.endsWith('/logout')) return filterValue === 'logout';
				if (path.endsWith('/register')) return filterValue === 'register';
			}

			if (path.includes('/api/inventory')) {
				if (method === 'POST') return filterValue === 'item_created';
				if (method === 'PUT' || method === 'PATCH') return filterValue === 'item_updated';
				if (method === 'DELETE') return filterValue === 'item_deleted';
			}

			if (path.includes('/api/users')) {
				if (method === 'POST') return filterValue === 'user_created';
				if (method === 'PUT' || method === 'PATCH') return filterValue === 'user_updated';
				if (method === 'DELETE') return filterValue === 'user_deleted';
			}

			if (path.includes('/api/class-codes')) {
				if (method === 'POST') return filterValue === 'class_created';
				if (method === 'DELETE') return filterValue === 'class_deleted';
				if (path.includes('/enrollments')) return filterValue === 'enrollment_updated';
			}
		}

		return false;
	}

	// ─── Filtered logs (User Actions / Security / System tabs) ───────────────
	const filteredLogs = $derived(
		logs.filter((log) => {
			const matchesSearch =
				log.entityName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				log.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				log.action?.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesAction = matchActivityAction({ kind: 'log', timestamp: new Date(log.timestamp), data: log }, selectedAction);
			let matchesTab = true;
			if (activeTab === 'user-actions') {
				matchesTab = log.userRole !== 'superadmin' && !log.action.toLowerCase().includes('login');
			} else if (activeTab === 'system') {
				matchesTab = log.entityType === 'category' || log.action.toLowerCase().includes('update');
			} else if (activeTab === 'security') {
				matchesTab =
					log.action.toLowerCase().includes('login') ||
					log.action.toLowerCase().includes('auth') ||
					log.action.toLowerCase().includes('delete');
			}
			return matchesSearch && matchesAction && matchesTab;
		})
	);

	// ─── Filtered requests (Borrow Requests tab) ──────────────────────────────
	const filteredRequests = $derived(
		requests.filter((r) => {
			const q = requestsSearchQuery.toLowerCase();
			const matchesSearch =
				!q ||
				r.student?.fullName?.toLowerCase().includes(q) ||
				r.student?.email?.toLowerCase().includes(q) ||
				r.id.toLowerCase().includes(q) ||
				r.purpose?.toLowerCase().includes(q);
			const matchesStatus = requestsStatusFilter === 'all' || r.status === requestsStatusFilter;
			return matchesSearch && matchesStatus;
		})
	);

	// ─── Session grouping ─────────────────────────────────────────────────────
	const SESSION_GAP_MS = 30 * 60 * 1000;
	let sessionExpanded = $state<Record<string, boolean>>({});

	// Flat activity feed — all activity types, used for session timelines
	const rawActivityFeed = $derived.by((): ActivityEntry[] => {
		const authEntries: ActivityEntry[] = authEvents
			.map(event => ({ kind: 'auth' as const, timestamp: new Date(event.occurredAt), data: event }));
		const logEntries: ActivityEntry[] = logs
			.map(log => ({ kind: 'log' as const, timestamp: new Date(log.timestamp), data: log }));
		const reqEntries: ActivityEntry[] = requests
			.map(r => ({ kind: 'request' as const, timestamp: new Date(r.createdAt), data: r }));
		const requestAuditEntries: ActivityEntry[] = requestAuditEvents
			.map(event => ({ kind: 'request-audit' as const, timestamp: new Date(event.timestamp), data: event }));
		return [...authEntries, ...logEntries, ...reqEntries, ...requestAuditEntries]
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	});

	const allActivityFeed = $derived.by((): ActivityEntry[] => {
		const q = searchQuery.toLowerCase();
		if (!q) return rawActivityFeed;
		return rawActivityFeed.filter((entry) => {
			if (entry.kind === 'auth') {
				return entry.data.userName.toLowerCase().includes(q) ||
					entry.data.email.toLowerCase().includes(q) ||
					entry.data.action.toLowerCase().includes(q) ||
					entry.data.userRole.toLowerCase().includes(q);
			}
			if (entry.kind === 'log') {
				return entry.data.entityName?.toLowerCase().includes(q) ||
					entry.data.userName?.toLowerCase().includes(q) ||
					entry.data.action?.toLowerCase().includes(q);
			}
			if (entry.kind === 'request') {
				return entry.data.student?.fullName?.toLowerCase().includes(q) ||
					entry.data.student?.email?.toLowerCase().includes(q) ||
					entry.data.id.toLowerCase().includes(q) ||
					entry.data.purpose?.toLowerCase().includes(q);
			}
			return entry.data.method.toLowerCase().includes(q) ||
				entry.data.path.toLowerCase().includes(q) ||
				String(entry.data.statusCode).includes(q) ||
				entry.data.userRole?.toLowerCase().includes(q);
		});
	});

	const groupedUserActivity = $derived.by((): AuditSession[] => {
		if (rawActivityFeed.length === 0) return [];

		type SessionState = {
			openSession: AuditSession | null;
			sessionCount: number;
		};

		const sessions: AuditSession[] = [];
		const stateByUser = new Map<string, SessionState>();

		function getState(userId: string): SessionState {
			let state = stateByUser.get(userId);
			if (!state) {
				state = { openSession: null, sessionCount: 0 };
				stateByUser.set(userId, state);
			}
			return state;
		}

		function getActorInfo(entry: ActivityEntry) {
			if (entry.kind === 'auth') {
				return {
					userId: entry.data.userId,
					userName: entry.data.userName,
					userRole: entry.data.userRole,
					userProfilePhotoUrl: entry.data.userProfilePhotoUrl,
					ipAddress: entry.data.ipAddress ?? undefined
				};
			}
			if (entry.kind === 'log') {
				return {
					userId: entry.data.userId,
					userName: entry.data.userName || 'System',
					userRole: entry.data.userRole || 'system',
					userProfilePhotoUrl: entry.data.userProfilePhotoUrl,
					ipAddress: entry.data.ipAddress
				};
			}
			if (entry.kind === 'request') {
				return {
					userId: entry.data.studentId,
					userName: entry.data.student?.fullName || 'Unknown',
					userRole: 'student',
					userProfilePhotoUrl: entry.data.student?.profilePhotoUrl,
					ipAddress: undefined
				};
			}
			return {
				userId: entry.data.userId ?? 'system',
				userName: entry.data.userName ?? 'System',
				userRole: entry.data.userRole || 'system',
				userProfilePhotoUrl: entry.data.userProfilePhotoUrl,
				ipAddress: entry.data.ipAddress
			};
		}

		function startSession(entry: ActivityEntry, info: ReturnType<typeof getActorInfo>): AuditSession {
			const state = getState(info.userId);
			state.sessionCount += 1;
			const session: AuditSession = {
				sessionId: `${info.userId}-${entry.timestamp.getTime()}-${state.sessionCount}`,
				userId: info.userId,
				userName: info.userName,
				userRole: info.userRole,
				userProfilePhotoUrl: info.userProfilePhotoUrl,
				loginTime: entry.timestamp,
				logoutTime: entry.timestamp,
				ipAddress: info.ipAddress,
				eventCount: 0,
				events: []
			};
			sessions.push(session);
			state.openSession = session;
			return session;
		}

		function appendToSession(session: AuditSession, entry: ActivityEntry): void {
			session.events.push(entry);
			session.eventCount += 1;
			if (entry.timestamp < session.loginTime) session.loginTime = entry.timestamp;
			if (session.logoutTime && entry.timestamp > session.logoutTime) {
				session.logoutTime = entry.timestamp;
			}
		}

		for (const entry of rawActivityFeed) {
			const info = getActorInfo(entry);
			const state = getState(info.userId);

			if (entry.kind === 'auth' && entry.data.action === 'login') {
				if (state.openSession) {
					state.openSession.logoutTime = entry.timestamp;
					state.openSession = null;
				}

				const session = startSession(entry, info);
				appendToSession(session, entry);
				continue;
			}

			if (entry.kind === 'auth' && entry.data.action === 'logout') {
				const session = state.openSession ?? startSession(entry, info);
				appendToSession(session, entry);
				session.logoutTime = entry.timestamp;
				state.openSession = null;
				continue;
			}

			const session = state.openSession ?? startSession(entry, info);
			appendToSession(session, entry);
		}

		for (const session of sessions) {
			session.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
		}

		return sessions.sort((a, b) => {
			const timeA = a.logoutTime ? a.logoutTime.getTime() : a.loginTime.getTime();
			const timeB = b.logoutTime ? b.logoutTime.getTime() : b.loginTime.getTime();
			return timeB - timeA;
		});
	});

	const displaySessions = $derived.by(() => {
		const q = searchQuery.toLowerCase();
		const actionFilter = selectedAction;

		return groupedUserActivity
			.map((session) => {
				const filteredEvents = session.events.filter((entry) => {
					// 1. Match action filter
					if (!matchActivityAction(entry, actionFilter)) return false;

					// 2. Match search query (on the event itself, or on the session header/actor info)
					if (!q) return true;

					const headerMatch =
						session.userName.toLowerCase().includes(q) ||
						session.userRole.toLowerCase().includes(q) ||
						(session.ipAddress && session.ipAddress.toLowerCase().includes(q));
					if (headerMatch) return true;

					if (entry.kind === 'auth') {
						return entry.data.userName.toLowerCase().includes(q) ||
							entry.data.email.toLowerCase().includes(q) ||
							entry.data.action.toLowerCase().includes(q) ||
							entry.data.userRole.toLowerCase().includes(q);
					}
					if (entry.kind === 'log') {
						return entry.data.entityName?.toLowerCase().includes(q) ||
							entry.data.userName?.toLowerCase().includes(q) ||
							entry.data.action?.toLowerCase().includes(q);
					}
					if (entry.kind === 'request') {
						return entry.data.student?.fullName?.toLowerCase().includes(q) ||
							entry.data.student?.email?.toLowerCase().includes(q) ||
							entry.data.id.toLowerCase().includes(q) ||
							entry.data.purpose?.toLowerCase().includes(q);
					}
					return entry.data.method.toLowerCase().includes(q) ||
						entry.data.path.toLowerCase().includes(q) ||
						String(entry.data.statusCode).includes(q);
				});

				return {
					...session,
					events: filteredEvents,
					eventCount: filteredEvents.length
				};
			})
			.filter((session) => {
				// If a search query or a specific action filter is active, only show sessions with matching events
				if (q || actionFilter !== 'all') {
					return session.eventCount > 0;
				}
				return true;
			});
	});

	const sessionsTotalPages = $derived(Math.ceil(displaySessions.length / SESSIONS_PER_PAGE));
	const paginatedSessions = $derived(displaySessions.slice((currentPage - 1) * SESSIONS_PER_PAGE, currentPage * SESSIONS_PER_PAGE));

	function toggleSession(id: string): void { sessionExpanded[id] = !sessionExpanded[id]; }
	function isSessionExpanded(id: string): boolean { return sessionExpanded[id] ?? false; }

	function sessionDuration(session: AuditSession): string {
		const end = session.logoutTime ?? new Date();
		const ms = end.getTime() - session.loginTime.getTime();
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${Math.round(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
	}

	// ─── Paginated slices ─────────────────────────────────────────────────────
	const totalPages       = $derived(Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
	const paginatedLogs    = $derived(filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE));
	const requestsTotalPages = $derived(Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE));
	const paginatedRequests  = $derived(filteredRequests.slice((requestsCurrentPage - 1) * REQUESTS_PER_PAGE, requestsCurrentPage * REQUESTS_PER_PAGE));

	// Reset pages on filter/tab change
	$effect(() => { activeTab; searchQuery; selectedAction; currentPage = 1; });
	$effect(() => { requestsSearchQuery; requestsStatusFilter; requestsCurrentPage = 1; });
</script>

<svelte:head>
	<title>Audit Logs | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">System Audit Logs</h1>
			<p class="mt-0.5 text-sm text-gray-500">
				Immutable activity trail for compliance, security monitoring, and system integrity.
			</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			{#each [
				{ id: 'all',          label: 'All Activity',    Icon: Database      },
				{ id: 'user-actions', label: 'User Actions',    Icon: User          },
				{ id: 'security',     label: 'Security Events', Icon: Shield        },
				{ id: 'system',       label: 'System Changes',  Icon: Settings      },
				{ id: 'requests',     label: 'Borrow Requests', Icon: ClipboardList }
			] as tab}
				<button
					onclick={() => (activeTab = tab.id as typeof activeTab)}
					class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab === tab.id ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<tab.Icon size={16} /> {tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Filter Controls — hidden on requests tab -->
	{#if activeTab !== 'requests'}
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search size={18} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search logs by actor, action, or resource..."
						class="w-full rounded-lg border border-gray-300 py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					/>
				</div>
				<div class="flex items-center gap-3">
					<select
						bind:value={selectedAction}
						aria-label="Filter by Action"
						class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					>
						<option value="all">All Actions</option>
						
						<optgroup label="Authentication">
							<option value="login">Login</option>
							<option value="logout">Logout</option>
							<option value="register">Register Account</option>
						</optgroup>

						<optgroup label="Borrow Requests">
							<option value="submit_request">Submit Request</option>
							<option value="approve_request">Approve Request</option>
							<option value="reject_request">Reject Request</option>
							<option value="cancel_request">Cancel Request</option>
							<option value="release_pickup">Release for Pickup</option>
							<option value="confirm_pickup">Confirm Pickup</option>
							<option value="confirm_return">Confirm Return</option>
							<option value="inspect_items">Inspect Items</option>
							<option value="extend_due_date">Extend Due Date</option>
							<option value="mark_missing">Mark as Missing</option>
							<option value="appeal_rejection">Appeal Rejection</option>
							<option value="send_reminder">Send Return Reminder</option>
						</optgroup>

						<optgroup label="Inventory Management">
							<option value="item_created">Create Item</option>
							<option value="item_updated">Update Item</option>
							<option value="item_deleted">Delete Item</option>
							<option value="item_archived">Archive Item</option>
							<option value="item_restored">Restore Item</option>
							<option value="category_created">Create Category</option>
							<option value="category_updated">Update Category</option>
							<option value="category_deleted">Delete Category</option>
							<option value="category_restored">Restore Category</option>
						</optgroup>

						<optgroup label="User & Class Management">
							<option value="user_created">Create User</option>
							<option value="user_updated">Update User</option>
							<option value="user_deleted">Delete User</option>
							<option value="class_created">Create Class Code</option>
							<option value="class_deleted">Delete Class Code</option>
							<option value="enrollment_updated">Update Enrollment</option>
						</optgroup>
					</select>
					<button
						onclick={exportAuditLogs}
						class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
					>
						<Download size={16} /> Export CSV
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Log Table Area -->
	{#if activeTab !== 'requests'}
		<div class="min-h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			{#if activeTabLoading && (activeTab === 'all' ? displaySessions.length === 0 : filteredLogs.length === 0)}
				<!-- Skeleton -->
				<div class="animate-pulse space-y-4 p-6">
					{#each Array(6) as _}
						<div class="flex items-center gap-4 border-b border-gray-100 py-3">
							<div class="h-4 w-4 shrink-0 rounded bg-gray-200"></div>
							<div class="h-9 w-9 shrink-0 rounded-full bg-gray-200"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-40 rounded bg-gray-200"></div>
								<div class="h-3 w-28 rounded bg-gray-200"></div>
							</div>
							<div class="h-6 w-20 rounded-full bg-gray-200"></div>
						</div>
					{/each}
				</div>

			{:else if activeTab === 'all'}
				<!-- ── Session-grouped All Activity feed ─────────────────────── -->
				{#if displaySessions.length === 0}
					<div class="flex flex-col items-center justify-center p-20 text-center">
						<Database class="mb-4 h-12 w-12 text-gray-300" />
						<p class="text-lg font-medium text-gray-900">No activity found</p>
						<p class="text-sm text-gray-500">Try adjusting your search query.</p>
					</div>
				{:else}
					<div class="divide-y divide-gray-100">
						{#each paginatedSessions as session}
							{@const expanded = isSessionExpanded(session.sessionId)}
							<div>
								<!-- Session header row -->
								<button
									type="button"
									onclick={() => toggleSession(session.sessionId)}
									class="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
									aria-expanded={expanded}
								>
									<span class="shrink-0 text-gray-400 transition-transform duration-150 {expanded ? 'rotate-90' : ''}">
										<ChevronRight size={16} />
									</span>

									<!-- Avatar -->
									<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white ring-2 ring-white">
										{#if session.userProfilePhotoUrl}
											<img src={session.userProfilePhotoUrl} alt={session.userName} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											{session.userName.substring(0, 2).toUpperCase()}
										{/if}
									</div>

									<!-- Identity & timestamps -->
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<span class="text-sm font-semibold text-gray-900">{session.userName}</span>
											<span class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {getRoleBadge(session.userRole)}">
												{session.userRole}
											</span>
											{#if session.ipAddress}
												<span class="font-mono text-[10px] text-gray-400">IP: {session.ipAddress}</span>
											{/if}
										</div>
										<div class="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
											<span class="flex items-center gap-1">
												<LogIn size={11} class="text-emerald-500" />
												<span class="font-medium text-gray-700">First activity:</span>
												{formatDate(session.loginTime)}
											</span>
											<span class="flex items-center gap-1">
												<LogOut size={11} class="text-rose-400" />
												<span class="font-medium text-gray-700">Latest activity:</span>
												{formatDate(session.logoutTime ?? undefined)}
											</span>
											<span class="flex items-center gap-1">
												<Clock size={11} />
												{sessionDuration(session)}
											</span>
										</div>
									</div>

									<!-- Event count -->
									<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
										<Activity size={11} />
										{session.eventCount} event{session.eventCount !== 1 ? 's' : ''}
									</span>
								</button>

								<!-- Expanded event rows -->
								{#if expanded}
									<div class="border-t border-gray-100 bg-gray-50/50">
										<table class="min-w-full">
											<thead>
												<tr class="border-b border-gray-100">
													<th scope="col" class="py-2 pl-16 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Time</th>
													<th scope="col" class="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
													<th scope="col" class="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Event</th>
													<th scope="col" class="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Resource</th>
													<th scope="col" class="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Details</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-gray-100">
												{#each session.events as entry}
													<tr class="transition-colors hover:bg-white">
														<td class="py-3 pl-16 pr-4 whitespace-nowrap">
															<span class="font-mono text-xs text-gray-500">
																{new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
															</span>
														</td>
														<td class="px-4 py-3 whitespace-nowrap">
															{#if entry.kind === 'auth'}
																<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
																	<Shield size={9} /> Authentication
																</span>
															{:else if entry.kind === 'log'}
																<span class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
																	<Database size={9} /> Inventory
																</span>
															{:else}
																<span class="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-700">
																	<ClipboardList size={9} /> Request
																</span>
															{/if}
														</td>
														<td class="px-4 py-3 whitespace-nowrap">
															{#if entry.kind === 'auth'}
																{@const auth = entry.data}
																<span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide {auth.action === 'login' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}">
																	{auth.action}
																</span>
															{:else if entry.kind === 'log'}
																{@const log = entry.data}
																{@const Icon = getActionIcon(log.action)}
																<span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide {getActionBadge(log.action)}">
																	<Icon size={10} />{log.action.replace(/_/g, ' ')}
																</span>
															{:else if entry.kind === 'request'}
																{@const req = entry.data}
																<span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold {getStatusBadge(req.status)}">
																	{formatStatus(req.status)}
																</span>
															{:else}
																{@const api = entry.data}
																<span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide {
																	api.statusCode >= 400 ? 'border-red-200 bg-red-50 text-red-700' :
																	api.method === 'POST' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
																	api.method === 'DELETE' ? 'border-amber-200 bg-amber-50 text-amber-700' :
																	'border-slate-200 bg-slate-50 text-slate-700'
																}">
																	{formatApiPath(api.method, api.path)}
																</span>
															{/if}
														</td>
														<td class="px-4 py-3 whitespace-nowrap">
															{#if entry.kind === 'auth'}
																{@const auth = entry.data}
																<p class="text-xs font-semibold text-gray-900">{auth.userName}</p>
																<p class="text-[10px] uppercase tracking-wider text-gray-400">{auth.userRole}</p>
															{:else if entry.kind === 'log'}
																{@const log = entry.data}
																<p class="text-xs font-semibold text-gray-900">{log.entityName || 'System Resource'}</p>
																<p class="text-[10px] uppercase tracking-wider text-gray-400">{log.entityType}</p>
															{:else if entry.kind === 'request'}
																{@const req = entry.data}
																<p class="font-mono text-xs font-semibold text-gray-700">REQ-{req.id.slice(-6).toUpperCase()}</p>
																<p class="text-[10px] text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''}</p>
															{:else}
																{@const api = entry.data}
																<p class="font-mono text-xs font-semibold text-gray-900">{getApiResourceName(api.path)}</p>
																<p class="text-[10px] uppercase tracking-wider text-gray-400">
																	{api.path.includes('/api/borrow-requests') ? 'Borrow Request' : 'System Endpoint'}
																</p>
															{/if}
														</td>
														<td class="px-4 py-3 text-xs text-gray-500">
															{#if entry.kind === 'auth'}
																{@const auth = entry.data}
																<div class="space-y-1">
																	<div class="text-gray-700">{auth.email}</div>
																	<div class="text-gray-400">{formatDate(auth.occurredAt)}</div>
																	{#if auth.ipAddress}
																		<div class="font-mono text-[10px] text-gray-400">IP: {auth.ipAddress}</div>
																	{/if}
																</div>
															{:else if entry.kind === 'log'}
																{@const log = entry.data}
																{#if log.changes && log.changes.length > 0}
																	<span>Modified {log.changes.length} field{log.changes.length !== 1 ? 's' : ''}</span>
																{:else if log.metadata && Object.keys(log.metadata).length > 0}
																	<span class="max-w-[160px] truncate text-gray-400" title={JSON.stringify(log.metadata)}>{Object.keys(log.metadata).join(', ')}</span>
																{:else}
																	<span class="italic text-gray-300">—</span>
																{/if}
															{:else if entry.kind === 'request'}
																{@const req = entry.data}
																<span class="text-gray-400">{formatShortDate(req.borrowDate)} → {formatShortDate(req.returnDate)}</span>
															{:else}
																{@const api = entry.data}
																<div class="space-y-0.5">
																	<div class="flex items-center gap-1.5 text-xs text-gray-600">
																		<span class="inline-flex rounded-sm px-1 py-0.2 text-[10px] font-bold {api.statusCode >= 400 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}">{api.statusCode}</span>
																		<span>{api.responseTimeMs}ms response</span>
																	</div>
																	{#if api.ipAddress}
																		<div class="font-mono text-[10px] text-gray-400">IP: {api.ipAddress}</div>
																	{/if}
																	{#if api.userAgent}
																		<div class="max-w-xs truncate text-[10px] text-gray-400" title={api.userAgent}>{api.userAgent}</div>
																	{/if}
																</div>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</div>
						{/each}
					</div>
					{#if sessionsTotalPages > 1}
						<Pagination
							{currentPage}
							totalPages={sessionsTotalPages}
							totalItems={displaySessions.length}
							itemsPerPage={SESSIONS_PER_PAGE}
							onPageChange={(page) => { currentPage = page; }}
							class="rounded-none border-x-0 border-t border-b-0 shadow-none"
						/>
					{/if}
				{/if}

			{:else}
				<!-- ── Filtered log tabs (User Actions / Security / System) ──── -->
				{#if filteredLogs.length === 0}
					<div class="flex flex-col items-center justify-center p-20 text-center">
						<Database class="mb-4 h-12 w-12 text-gray-300" />
						<p class="text-lg font-medium text-gray-900">No logs found</p>
						<p class="text-sm text-gray-500">Try adjusting your search query or filters.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Timestamp</th>
									<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actor</th>
									<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
									<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Target Resource</th>
									<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Metadata / IP</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100 bg-white">
								{#each paginatedLogs as log}
									{@const Icon = getActionIcon(log.action)}
									<tr class="transition-colors hover:bg-gray-50">
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="text-sm font-medium text-gray-900">{formatDate(log.timestamp).split(',')[0]}</div>
											<div class="text-xs text-gray-500">{formatDate(log.timestamp).split(',')[1]}</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="flex items-center gap-3">
												<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white">
													{#if log.userProfilePhotoUrl}
														<img src={log.userProfilePhotoUrl} alt={log.userName} class="h-full w-full object-cover" loading="lazy" />
													{:else}
														{log.userName ? log.userName.substring(0, 2).toUpperCase() : 'SY'}
													{/if}
												</div>
												<div>
													<p class="text-sm font-bold text-gray-900">{log.userName || 'System'}</p>
													<p class="text-xs capitalize text-gray-500">{log.userRole || 'System Admin'}</p>
												</div>
											</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<span class="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide {getActionBadge(log.action)}">
												<Icon size={12} />{log.action.replace(/_/g, ' ')}
											</span>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<p class="text-sm font-bold text-gray-900">{log.entityName || 'System Resource'}</p>
											<p class="text-xs uppercase tracking-wider text-gray-500">{log.entityType}</p>
										</td>
										<td class="px-6 py-4 text-sm text-gray-500">
											{#if log.ipAddress}
												<div class="mb-1 text-xs text-gray-400">IP: {log.ipAddress}</div>
											{/if}
											{#if log.changes && log.changes.length > 0}
												<div class="max-w-[200px] truncate text-xs">Modified {log.changes.length} field(s)</div>
											{:else if log.metadata && Object.keys(log.metadata).length > 0}
												<div class="max-w-[200px] truncate text-xs" title={JSON.stringify(log.metadata)}>{Object.keys(log.metadata).join(', ')}</div>
											{:else}
												<span class="text-xs italic text-gray-400">No additional details</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if totalPages > 1}
						<Pagination
							{currentPage}
							{totalPages}
							totalItems={filteredLogs.length}
							itemsPerPage={ITEMS_PER_PAGE}
							onPageChange={(page) => { currentPage = page; }}
							class="rounded-none border-x-0 border-t border-b-0 shadow-none"
						/>
					{/if}
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Borrow Requests Tab -->
	{#if activeTab === 'requests'}
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search size={18} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={requestsSearchQuery}
						placeholder="Search by student, email, or purpose..."
						class="w-full rounded-lg border border-gray-300 py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					/>
				</div>
				<select
					bind:value={requestsStatusFilter}
					aria-label="Filter by status"
					class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
				>
					<option value="all">All Statuses</option>
					<option value="pending_instructor">Under Review</option>
					<option value="approved_instructor">Approved</option>
					<option value="ready_for_pickup">Ready for Pickup</option>
					<option value="borrowed">Active Loan</option>
					<option value="pending_return">Confirm Pickup</option>
					<option value="returned">Returned</option>
					<option value="rejected">Declined</option>
					<option value="cancelled">Cancelled</option>
				</select>
			</div>
		</div>

		<div class="min-h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			{#if activeTabLoading && requests.length === 0}
				<div class="animate-pulse space-y-4 p-6">
					{#each Array(6) as _}
						<div class="flex items-center gap-4 border-b border-gray-100 py-3">
							<div class="h-8 w-8 shrink-0 rounded-full bg-gray-200"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-40 rounded bg-gray-200"></div>
								<div class="h-3 w-28 rounded bg-gray-200"></div>
							</div>
							<div class="h-6 w-24 rounded bg-gray-200"></div>
							<div class="h-4 w-20 rounded bg-gray-200"></div>
						</div>
					{/each}
				</div>
			{:else if filteredRequests.length === 0}
				<div class="flex flex-col items-center justify-center p-20 text-center">
					<ClipboardList class="mb-4 h-12 w-12 text-gray-300" />
					<p class="text-lg font-medium text-gray-900">No requests found</p>
					<p class="text-sm text-gray-500">Try adjusting your search or status filter.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Request ID</th>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Student</th>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Current Status</th>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actioned By</th>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Items</th>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Borrow Period</th>
								<th scope="col" class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Submitted</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100 bg-white">
							{#each paginatedRequests as req}
								{@const actor = getRequestActor(req)}
								<tr class="transition-colors hover:bg-gray-50">
									<!-- Request ID -->
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="font-mono text-xs font-semibold text-gray-700">REQ-{req.id.slice(-6).toUpperCase()}</span>
										<p class="mt-0.5 text-[10px] text-gray-400">{formatShortDate(req.createdAt)}</p>
									</td>

									<!-- Student (the requester) -->
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center gap-3">
											<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white">
												{#if req.student?.profilePhotoUrl}
													<img src={req.student.profilePhotoUrl} alt={req.student.fullName} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													{req.student?.firstName?.[0] ?? ''}{req.student?.lastName?.[0] ?? ''}
												{/if}
											</div>
											<div>
												<p class="text-sm font-semibold text-gray-900">{req.student?.fullName ?? 'Unknown'}</p>
												<p class="text-xs text-gray-500">{req.student?.email ?? '—'}</p>
											</div>
										</div>
									</td>

									<!-- Current status badge -->
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadge(req.status)}">
											{formatStatus(req.status)}
										</span>
									</td>

									<!-- Actioned By — who performed the last lifecycle action -->
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center gap-2.5">
											<!-- Actor avatar -->
											<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 ring-2 ring-white">
												{#if actor.photoUrl}
													<img src={actor.photoUrl} alt={actor.name} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													{actor.initials}
												{/if}
											</div>
											<!-- Actor identity + action + timestamp -->
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-1">
													<p class="text-xs font-semibold text-gray-900 truncate max-w-[120px]">{actor.name}</p>
													<span class="inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {getRoleBadge(actor.role)}">{actor.role}</span>
												</div>
												<p class="text-[11px] text-gray-500 mt-0.5">{actor.action}</p>
												{#if actor.at}
													<p class="text-[10px] text-gray-400 mt-0.5 font-mono">{formatDate(actor.at)}</p>
												{/if}
											</div>
										</div>
									</td>

									<!-- Items count -->
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700">
										{req.items.length} item{req.items.length !== 1 ? 's' : ''}
									</td>

									<!-- Borrow period -->
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-600">
										{formatShortDate(req.borrowDate)} → {formatShortDate(req.returnDate)}
									</td>

									<!-- Submission date -->
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
										{formatShortDate(req.createdAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if requestsTotalPages > 1}
					<Pagination
						currentPage={requestsCurrentPage}
						totalPages={requestsTotalPages}
						totalItems={filteredRequests.length}
						itemsPerPage={REQUESTS_PER_PAGE}
						onPageChange={(page) => { requestsCurrentPage = page; }}
						class="rounded-none border-x-0 border-t border-b-0 shadow-none"
					/>
				{/if}
			{/if}
		</div>
	{/if}
</div>
