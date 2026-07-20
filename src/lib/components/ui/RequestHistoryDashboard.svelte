<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestStatus } from '$lib/api/borrowRequests';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { toastStore } from '$lib/stores/toast';
	import { donationsAPI } from '$lib/api/donations';
	import { inventoryActivityLogsAPI } from '$lib/api/inventoryActivityLogs';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import { 
		Search, 
		Filter, 
		User, 
		Clock, 
		Package, 
		ChevronRight, 
		ArrowLeft, 
		Calendar, 
		MapPin, 
		CheckCircle2, 
		XCircle, 
		AlertTriangle, 
		ChevronDown,
		FileText,
		Sliders,
		ArrowUpRight,
		ArrowDownRight,
		Shield
	} from 'lucide-svelte';

	// Component Props
	let { role = 'admin' } = $props<{ role?: string }>();

	// State variables
	let requests = $state<BorrowRequestRecord[]>([]);
	let totalRequestsCount = $state(0);
	let loading = $state(true);
	let searchQuery = $state('');
	let statusFilter = $state('');
	let locationFilter = $state('');
	
	// Pagination state
	let currentPage = $state(1);
	let itemsPerPage = $state(15);

	// Detailed student profile modal/drilldown state
	let selectedStudentId = $state<string | null>(null);
	let showStudentDetail = $state(false);

	// Detailed item profile state
	let selectedItemId = $state<string | null>(null);
	let showItemDetail = $state(false);

	// Item adjustments audit state
	export interface ItemAdjustmentRecord {
		id: string;
		itemName: string;
		action: 'add' | 'subtract';
		quantity: number;
		reason: string;
		adjustedBy: string;
		role: string;
		timestamp: string;
	}

	let adjustments = $state<ItemAdjustmentRecord[]>([]);
	let adjustmentsLoading = $state(false);
	let adjustmentsLoaded = $state(false);

	async function fetchAdjustments() {
		if (adjustmentsLoaded) return;
		adjustmentsLoading = true;
		try {
			const [donationsRes, logsRes] = await Promise.allSettled([
				donationsAPI.getAll({ limit: 500 }),
				inventoryActivityLogsAPI.getActivityLogs({ limit: 500 })
			]);

			const records: ItemAdjustmentRecord[] = [];

			if (donationsRes.status === 'fulfilled' && donationsRes.value.donations) {
				const stockDonations = donationsRes.value.donations.filter(
					(d) => d.donorName === 'Custodian Stock Adjustment'
				);
				for (const d of stockDonations) {
					records.push({
						id: d.id || `ADJ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
						itemName: d.itemName || 'Equipment Item',
						action: d.quantity >= 0 ? 'add' : 'subtract',
						quantity: Math.abs(d.quantity),
						reason: d.notes || d.purpose || 'Stock level adjustment',
						adjustedBy: 'Lab Custodian',
						role: 'custodian',
						timestamp: d.date || d.createdAt
					});
				}
			}

			if (logsRes.status === 'fulfilled' && logsRes.value.activityLogs) {
				const stockLogs = logsRes.value.activityLogs.filter(
					(l) =>
						l.action.includes('adjust') ||
						l.action.includes('stock') ||
						l.action.includes('quantity') ||
						(l.changes && l.changes.some((c) => c.field === 'quantity'))
				);
				for (const l of stockLogs) {
					const qtyChange = l.changes?.find((c) => c.field === 'quantity');
					const oldQty = qtyChange?.oldValue ?? 0;
					const newQty = qtyChange?.newValue ?? 0;
					const diff = newQty - oldQty;

					records.push({
						id: l.id || `LOG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
						itemName: l.entityName || 'Equipment Item',
						action: diff >= 0 ? 'add' : 'subtract',
						quantity: Math.abs(diff !== 0 ? diff : 1),
						reason: l.metadata?.reason || l.action || 'Inventory update',
						adjustedBy: l.userName || 'System User',
						role: l.userRole || 'custodian',
						timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString()
					});
				}
			}

			records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
			adjustments = records;
			adjustmentsLoaded = true;
		} catch (err) {
			console.error('Failed to load item adjustment logs:', err);
		} finally {
			adjustmentsLoading = false;
		}
	}

	let registeredStudents = $state<UserResponse[]>([]);

	async function fetchStudents() {
		try {
			const res = await usersAPI.getAll({ role: 'student', limit: 1000 });
			registeredStudents = res.users || [];
		} catch (err) {
			console.error('[REQUEST-HISTORY] Failed to load registered students:', err);
		}
	}

	// Fetch all requests, adjustments, and students on mount
	onMount(async () => {
		try {
			await Promise.all([fetchRequests(), fetchAdjustments(), fetchStudents()]);
		} catch (err: any) {
			console.error('[REQUEST-HISTORY] Failed to load request history:', err);
		} finally {
			loading = false;
		}
	});

	async function fetchRequests() {
		// Fetch with a high limit to compile all-time student history locally
		const res = await borrowRequestsAPI.list({ limit: 1000 }, { forceRefresh: true });
		requests = res.requests;
		totalRequestsCount = res.total;
	}

	// Filtered requests derived state
	const filteredRequests = $derived.by(() => {
		let result = requests;

		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			result = result.filter(req => {
				const studentName = req.student?.fullName || '';
				const studentEmail = req.student?.email || '';
				const purpose = req.purpose || '';
				const reqId = req.id || '';
				const itemsMatch = req.items.some(item => item.name.toLowerCase().includes(query));

				return (
					studentName.toLowerCase().includes(query) ||
					studentEmail.toLowerCase().includes(query) ||
					purpose.toLowerCase().includes(query) ||
					reqId.toLowerCase().includes(query) ||
					itemsMatch
				);
			});
		}

		if (statusFilter) {
			result = result.filter(req => req.status === statusFilter);
		}

		if (locationFilter) {
			result = result.filter(req => req.usageLocation === locationFilter);
		}

		return result;
	});

	// Group requests by Student to provide student directory and all-time history
	interface StudentStats {
		studentId: string;
		fullName: string;
		email: string;
		profilePhotoUrl?: string;
		yearLevel: string;
		block: string;
		totalRequests: number;
		totalItemsRequested: number;
		statusBreakdown: Record<BorrowRequestStatus, number>;
		requests: BorrowRequestRecord[];
		allItems: Record<string, {
			itemId: string;
			name: string;
			category?: string;
			picture?: string;
			totalQuantity: number;
			lastRequestedAt: string;
		}>;
	}

	const studentDirectory = $derived.by(() => {
		const directory: Record<string, StudentStats> = {};

		// 1. Populate registered students from database first
		for (const u of registeredStudents) {
			const fullName = `${u.firstName} ${u.lastName}`.trim() || 'Student User';
			directory[u.id] = {
				studentId: u.id,
				fullName,
				email: u.email || '',
				profilePhotoUrl: u.profilePhotoUrl,
				yearLevel: u.yearLevel || 'N/A',
				block: u.block || 'N/A',
				totalRequests: 0,
				totalItemsRequested: 0,
				statusBreakdown: {} as any,
				requests: [],
				allItems: {}
			};
		}

		// 2. Aggregate request logs metrics
		for (const req of requests) {
			const sId = req.studentId || (req.student as any)?.id;
			if (!sId) continue;

			if (!directory[sId]) {
				const fullName = req.student?.fullName || 'Student User';
				directory[sId] = {
					studentId: sId,
					fullName,
					email: req.student?.email || '',
					profilePhotoUrl: req.student?.profilePhotoUrl,
					yearLevel: req.student?.yearLevel || 'N/A',
					block: req.student?.block || 'N/A',
					totalRequests: 0,
					totalItemsRequested: 0,
					statusBreakdown: {} as any,
					requests: [],
					allItems: {}
				};
			}

			const stats = directory[sId];
			if (req.student?.fullName) stats.fullName = req.student.fullName;
			if (req.student?.email) stats.email = req.student.email;
			if (req.student?.profilePhotoUrl) stats.profilePhotoUrl = req.student.profilePhotoUrl;
			if (req.student?.yearLevel) stats.yearLevel = req.student.yearLevel;
			if (req.student?.block) stats.block = req.student.block;

			stats.totalRequests += 1;
			stats.requests.push(req);
			stats.statusBreakdown[req.status] = (stats.statusBreakdown[req.status] || 0) + 1;

			for (const item of req.items) {
				stats.totalItemsRequested += item.quantity;
				const itemId = item.itemId;
				if (!stats.allItems[itemId]) {
					stats.allItems[itemId] = {
						itemId: item.itemId,
						name: item.name,
						category: item.category,
						picture: item.picture,
						totalQuantity: 0,
						lastRequestedAt: req.createdAt
					};
				}
				const itemStats = stats.allItems[itemId];
				itemStats.totalQuantity += item.quantity;

				if (new Date(req.createdAt) > new Date(itemStats.lastRequestedAt)) {
					itemStats.lastRequestedAt = req.createdAt;
				}
			}
		}

		return Object.values(directory).sort((a, b) => b.totalRequests - a.totalRequests);
	});

	// Group requests by Item to provide unique requested items directory and who requested them
	interface RequestedItemStats {
		itemId: string;
		name: string;
		category?: string;
		picture?: string;
		totalQuantityRequested: number;
		totalRequestsCount: number;
		lastRequestedAt: string;
		students: Record<string, {
			studentId: string;
			fullName: string;
			email: string;
			profilePhotoUrl?: string;
			yearLevel: string;
			block: string;
			requests: Array<{
				requestId: string;
				quantity: number;
				borrowDate: string;
				returnDate: string;
				status: BorrowRequestStatus;
				purpose: string;
				createdAt: string;
			}>;
		}>;
	}

	const itemsDirectory = $derived.by(() => {
		const directory: Record<string, RequestedItemStats> = {};

		for (const req of requests) {
			for (const item of req.items) {
				const itemId = item.itemId;
				if (!itemId) continue;

				if (!directory[itemId]) {
					directory[itemId] = {
						itemId: itemId,
						name: item.name,
						category: item.category,
						picture: item.picture,
						totalQuantityRequested: 0,
						totalRequestsCount: 0,
						lastRequestedAt: req.createdAt,
						students: {}
					};
				}

				const stats = directory[itemId];
				stats.totalQuantityRequested += item.quantity;
				stats.totalRequestsCount += 1;

				if (new Date(req.createdAt) > new Date(stats.lastRequestedAt)) {
					stats.lastRequestedAt = req.createdAt;
				}

				const studentId = req.studentId;
				if (studentId && req.student) {
					if (!stats.students[studentId]) {
						stats.students[studentId] = {
							studentId: studentId,
							fullName: req.student.fullName || 'Unknown Student',
							email: req.student.email || 'N/A',
							profilePhotoUrl: req.student.profilePhotoUrl,
							yearLevel: req.student.yearLevel || 'N/A',
							block: req.student.block || 'N/A',
							requests: []
						};
					}

					stats.students[studentId].requests.push({
						requestId: req.id,
						quantity: item.quantity,
						borrowDate: req.borrowDate,
						returnDate: req.returnDate,
						status: req.status,
						purpose: req.purpose,
						createdAt: req.createdAt
					});
				}
			}
		}

		return Object.values(directory).sort((a, b) => b.totalQuantityRequested - a.totalQuantityRequested);
	});

	// Get active selected student detailed info
	const selectedStudent = $derived(
		selectedStudentId ? studentDirectory.find(s => s.studentId === selectedStudentId) : null
	);

	const studentAllItemsList = $derived(
		selectedStudent ? Object.values(selectedStudent.allItems).sort((a, b) => b.totalQuantity - a.totalQuantity) : []
	);

	// Get active selected item detailed info
	const selectedItem = $derived(
		selectedItemId ? itemsDirectory.find(i => i.itemId === selectedItemId) : null
	);

	const selectedItemStudentsList = $derived(
		selectedItem ? Object.values(selectedItem.students).sort((a, b) => b.fullName.localeCompare(a.fullName)) : []
	);

	// Filtered requested items derived state
	const filteredRequestedItems = $derived.by(() => {
		let result = itemsDirectory;
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			result = result.filter(item => 
				item.name.toLowerCase().includes(query) ||
				(item.category && item.category.toLowerCase().includes(query))
			);
		}
		return result;
	});

	// Filtered students derived state
	const filteredStudents = $derived.by(() => {
		let result = studentDirectory;
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			result = result.filter(
				(s) =>
					s.fullName.toLowerCase().includes(query) ||
					s.email.toLowerCase().includes(query) ||
					s.studentId.toLowerCase().includes(query) ||
					s.yearLevel.toLowerCase().includes(query) ||
					s.block.toLowerCase().includes(query)
			);
		}
		return result;
	});

	// Filtered adjustments derived state
	const filteredAdjustments = $derived.by(() => {
		let result = adjustments;
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			result = result.filter(
				(a) =>
					a.itemName.toLowerCase().includes(query) ||
					a.reason.toLowerCase().includes(query) ||
					a.adjustedBy.toLowerCase().includes(query) ||
					a.id.toLowerCase().includes(query)
			);
		}
		return result;
	});

	// Pagination math adapt to active tab
	const totalItems = $derived.by(() => {
		if (activeMainTab === 'requests') return filteredRequests.length;
		if (activeMainTab === 'items') return filteredRequestedItems.length;
		if (activeMainTab === 'adjustments') return filteredAdjustments.length;
		return filteredStudents.length;
	});

	const totalPages = $derived(Math.max(1, Math.ceil(totalItems / itemsPerPage)));

	const paginatedRequests = $derived(
		filteredRequests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	const paginatedItems = $derived(
		filteredRequestedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	const paginatedStudents = $derived(
		filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	const paginatedAdjustments = $derived(
		filteredAdjustments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	// Tabs for main view
	type MainTab = 'requests' | 'items' | 'students' | 'adjustments';
	let activeMainTab = $state<MainTab>('requests');

	// Tab inside student detailed view
	type DetailTab = 'items' | 'requests';
	let activeDetailTab = $state<DetailTab>('items');

	// Helper for status formatting
	function getStatusBadge(status: BorrowRequestStatus) {
		const config: Record<BorrowRequestStatus, { text: string; class: string }> = {
			pending_instructor: { text: 'Pending Instructor', class: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
			approved_instructor: { text: 'Approved by Instructor', class: 'bg-blue-50 text-blue-800 border-blue-200' },
			ready_for_pickup: { text: 'Ready for Pickup', class: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
			borrowed: { text: 'Borrowed', class: 'bg-purple-50 text-purple-800 border-purple-200' },
			pending_return: { text: 'Pending Return', class: 'bg-orange-50 text-orange-800 border-orange-200' },
			missing: { text: 'Missing', class: 'bg-red-50 text-red-800 border-red-200' },
			resolved: { text: 'Resolved', class: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
			returned: { text: 'Returned & Completed', class: 'bg-green-50 text-green-800 border-green-200' },
			cancelled: { text: 'Cancelled', class: 'bg-gray-50 text-gray-800 border-gray-200' },
			rejected: { text: 'Rejected', class: 'bg-rose-50 text-rose-800 border-rose-200' },
			pending_appeal: { text: 'Pending Appeal', class: 'bg-cyan-50 text-cyan-800 border-cyan-200' }
		};

		const c = config[status] || { text: status, class: 'bg-gray-50 text-gray-800 border-gray-200' };
		return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${c.class}">${c.text}</span>`;
	}

	function formatTimestamp(dateStr: string): string {
		if (!dateStr) return 'N/A';
		const d = new Date(dateStr);
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(d);
	}

	function formatShortDate(dateStr: string): string {
		if (!dateStr) return 'N/A';
		const d = new Date(dateStr);
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium'
		}).format(d);
	}

	function viewStudentProfile(studentId: string) {
		selectedStudentId = studentId;
		activeDetailTab = 'items';
		showStudentDetail = true;
		
		// Clear item detail states
		selectedItemId = null;
		showItemDetail = false;
	}

	function viewItemDetail(itemId: string) {
		selectedItemId = itemId;
		showItemDetail = true;
		
		// Clear student detail states
		selectedStudentId = null;
		showStudentDetail = false;
	}

	function goBackToList() {
		showStudentDetail = false;
		selectedStudentId = null;
		showItemDetail = false;
		selectedItemId = null;
	}
</script>

<svelte:head>
	<title>Request & Borrow History - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<!-- Top Navigation Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			{#if showStudentDetail && selectedStudent}
				<button 
					onclick={goBackToList} 
					class="mb-2 flex items-center gap-1 text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors"
				>
					<ArrowLeft size={14} /> Back to History list
				</button>
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Student Request Profile</h1>
				<p class="mt-1 text-sm text-gray-500">All-time request logs and item metrics for {selectedStudent.fullName}</p>
			{:else if showItemDetail && selectedItem}
				<button 
					onclick={goBackToList} 
					class="mb-2 flex items-center gap-1 text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors"
				>
					<ArrowLeft size={14} /> Back to History list
				</button>
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Item Request Profile</h1>
				<p class="mt-1 text-sm text-gray-500">All-time request stats and student logs for {selectedItem.name}</p>
			{:else}
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Borrow Request History</h1>
				<p class="mt-1 text-sm text-gray-500">View items requested, requesting students, and individual all-time profiles</p>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="flex h-64 items-center justify-center rounded-xl bg-white shadow-sm">
			<div class="flex flex-col items-center gap-3">
				<div class="h-10 w-10 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600"></div>
				<p class="text-sm font-semibold text-gray-500">Loading history logs...</p>
			</div>
		</div>
	{:else}
		<!-- Main Drilldown Page / List switcher -->
		{#if showStudentDetail && selectedStudent}
			<!-- DETAILED STUDENT DRILLDOWN VIEW -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
				<!-- Student Info Left Card -->
				<div class="lg:col-span-4 space-y-6">
					<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
						<div class="flex flex-col items-center text-center">
							<div class="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-3xl font-bold text-pink-700 ring-4 ring-pink-50">
								{#if selectedStudent.profilePhotoUrl}
									<img src={selectedStudent.profilePhotoUrl} alt={selectedStudent.fullName} class="h-full w-full object-cover" />
								{:else}
									{selectedStudent.fullName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')}
								{/if}
							</div>
							<h2 class="mt-4 text-xl font-bold text-gray-900">{selectedStudent.fullName}</h2>
							<p class="text-sm text-gray-500">{selectedStudent.email}</p>
							
							<div class="mt-3 inline-flex items-center rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700">
								{selectedStudent.yearLevel} • Block {selectedStudent.block}
							</div>
						</div>

						<div class="mt-8 border-t border-gray-100 pt-6">
							<h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">All-Time Statistics</h3>
							<div class="mt-4 grid grid-cols-2 gap-4">
								<div class="rounded-xl bg-gray-50 p-4 border border-gray-100">
									<p class="text-2xl font-bold text-gray-900">{selectedStudent.totalRequests}</p>
									<p class="mt-1 text-xs font-semibold text-gray-500">Total Requests</p>
								</div>
								<div class="rounded-xl bg-gray-50 p-4 border border-gray-100">
									<p class="text-2xl font-bold text-gray-900">{selectedStudent.totalItemsRequested}</p>
									<p class="mt-1 text-xs font-semibold text-gray-500">Items Requested</p>
								</div>
							</div>
						</div>

						<div class="mt-6 space-y-3">
							<h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Request Status Breakdown</h3>
							<div class="space-y-2 mt-3">
								{#each Object.entries(selectedStudent.statusBreakdown) as [status, count]}
									<div class="flex items-center justify-between text-xs">
										<span class="capitalize text-gray-600">{status.replace(/_/g, ' ')}</span>
										<span class="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- Student Item History / Request Logs Right Card -->
				<div class="lg:col-span-8 space-y-6">
					<div class="rounded-2xl border border-gray-200 bg-white shadow-xs">
						<!-- Drilldown Tab Navigation -->
						<div class="border-b border-gray-200 px-6 pt-4">
							<nav class="-mb-px flex gap-6" aria-label="Student profile tabs">
								<button
									onclick={() => activeDetailTab = 'items'}
									class="border-b-2 pb-4 text-sm font-semibold transition-all {activeDetailTab === 'items'
										? 'border-pink-500 text-pink-600'
										: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									All-Time Items Requested ({studentAllItemsList.length})
								</button>
								<button
									onclick={() => activeDetailTab = 'requests'}
									class="border-b-2 pb-4 text-sm font-semibold transition-all {activeDetailTab === 'requests'
										? 'border-pink-500 text-pink-600'
										: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									Request History Feed ({selectedStudent.requests.length})
								</button>
							</nav>
						</div>

						<!-- Drilldown Tabs Content -->
						<div class="p-6">
							{#if activeDetailTab === 'items'}
								<!-- Items list student has ever requested -->
								{#if studentAllItemsList.length === 0}
									<p class="text-center text-sm text-gray-500 py-12">No requested items found.</p>
								{:else}
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
													<th class="pb-3 pl-2">Item</th>
													<th class="pb-3">Category</th>
													<th class="pb-3 text-center">Total Quantity Requested</th>
													<th class="pb-3 text-right pr-2">Last Requested</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-gray-100">
												{#each studentAllItemsList as item}
													<tr class="hover:bg-gray-50/50 transition-colors">
														<td class="py-3.5 pl-2">
															<div class="flex items-center gap-3">
																{#if item.picture}
																	<img src={item.picture} alt={item.name} class="h-10 w-10 rounded-lg object-cover ring-1 ring-gray-100" />
																{:else}
																	<div class="h-10 w-10 rounded-lg overflow-hidden ring-1 ring-gray-100">
																		<ItemImagePlaceholder size="sm" />
																	</div>
																{/if}
																<span class="font-semibold text-gray-900">{item.name}</span>
															</div>
														</td>
														<td class="py-3.5 text-gray-600">{item.category || 'N/A'}</td>
														<td class="py-3.5 text-center font-bold text-gray-900 tabular-nums">{item.totalQuantity}</td>
														<td class="py-3.5 text-right pr-2 text-gray-500">{formatShortDate(item.lastRequestedAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							{:else}
								<!-- Detailed borrow request list for that student -->
								{#if selectedStudent.requests.length === 0}
									<p class="text-center text-sm text-gray-500 py-12">No requests logged.</p>
								{:else}
									<div class="space-y-4">
										{#each selectedStudent.requests as req}
											<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 transition-all hover:bg-gray-100/50">
												<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
													<div>
														<span class="font-mono text-xs font-bold text-pink-600">REQ-{req.id.slice(-6).toUpperCase()}</span>
														<span class="ml-2 text-xs text-gray-500">{formatTimestamp(req.createdAt)}</span>
													</div>
													<div>
														{@html getStatusBadge(req.status)}
													</div>
												</div>
												<div class="mt-3">
													<p class="text-xs font-semibold text-gray-500">Purpose</p>
													<p class="text-sm font-medium text-gray-800">{req.purpose || 'No purpose description provided.'}</p>
												</div>
												<div class="mt-3 grid grid-cols-2 gap-4 text-xs text-gray-600">
													<div>
														<span class="font-semibold">Borrow Period:</span> 
														{formatShortDate(req.borrowDate)} - {formatShortDate(req.returnDate)}
													</div>
													<div>
														<span class="font-semibold">Location:</span> 
														{req.usageLocation === 'school' ? 'In-School' : 'Outdoor/Off-Campus'}
													</div>
												</div>
												<div class="mt-4 border-t border-gray-200/60 pt-3">
													<p class="text-xs font-bold text-gray-500 mb-2">Requested Items</p>
													<div class="flex flex-wrap gap-2">
														{#each req.items as item}
															<span class="inline-flex items-center rounded-lg bg-white border border-gray-200 px-2 py-1 text-xs text-gray-700">
																{item.name} <strong class="ml-1.5 text-pink-600">x{item.quantity}</strong>
															</span>
														{/each}
													</div>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			{#if showItemDetail && selectedItem}
				<!-- DETAILED ITEM DRILLDOWN VIEW -->
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
					<!-- Item Info Left Card -->
					<div class="lg:col-span-4 space-y-6">
						<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
							<div class="flex flex-col items-center text-center">
								<div class="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl bg-gray-50 ring-4 ring-pink-50 border border-gray-100">
									{#if selectedItem.picture}
										<img src={selectedItem.picture} alt={selectedItem.name} class="h-full w-full object-cover" />
									{:else}
										<div class="h-full w-full overflow-hidden">
											<ItemImagePlaceholder size="lg" />
										</div>
									{/if}
								</div>
								<h2 class="mt-4 text-xl font-bold text-gray-900">{selectedItem.name}</h2>
								
								{#if selectedItem.category}
									<div class="mt-2 inline-flex items-center rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700">
										{selectedItem.category}
									</div>
								{/if}
							</div>

							<div class="mt-8 border-t border-gray-100 pt-6">
								<h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">All-Time Metrics</h3>
								<div class="mt-4 grid grid-cols-2 gap-4">
									<div class="rounded-xl bg-gray-50 p-4 border border-gray-100">
										<p class="text-2xl font-bold text-gray-900">{selectedItem.totalQuantityRequested}</p>
										<p class="mt-1 text-xs font-semibold text-gray-500">Qty Borrowed</p>
									</div>
									<div class="rounded-xl bg-gray-50 p-4 border border-gray-100">
										<p class="text-2xl font-bold text-gray-900">{selectedItem.totalRequestsCount}</p>
										<p class="mt-1 text-xs font-semibold text-gray-500">Total Requests</p>
									</div>
								</div>
							</div>

							<div class="mt-6 border-t border-gray-100 pt-6 space-y-3">
								<div class="flex justify-between items-center text-xs">
									<span class="text-gray-500 font-semibold">Unique Borrowers</span>
									<span class="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">{selectedItemStudentsList.length}</span>
								</div>
								<div class="flex justify-between items-center text-xs">
									<span class="text-gray-500 font-semibold">Last Requested</span>
									<span class="font-bold text-gray-700">{formatShortDate(selectedItem.lastRequestedAt)}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Item Borrowers Right Card -->
					<div class="lg:col-span-8 space-y-6">
						<div class="rounded-2xl border border-gray-200 bg-white shadow-xs p-6">
							<h3 class="text-lg font-bold text-gray-900 mb-4">Students Who Requested This Item</h3>
							
							{#if selectedItemStudentsList.length === 0}
								<p class="text-center text-sm text-gray-500 py-12">No requests recorded for this item.</p>
							{:else}
								<div class="space-y-6">
									{#each selectedItemStudentsList as borrower}
										<div class="rounded-xl border border-gray-100 bg-gray-50/50 p-5 hover:bg-gray-100/50 transition-colors">
											<!-- Student Header -->
											<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200/60 pb-3">
												<div class="flex items-center gap-3">
													<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-bold text-pink-700 ring-2 ring-pink-50">
														{#if borrower.profilePhotoUrl}
															<img src={borrower.profilePhotoUrl} alt={borrower.fullName} class="h-full w-full object-cover" />
														{:else}
															{borrower.fullName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')}
														{/if}
													</div>
													<div>
														<p class="text-sm font-bold text-gray-900">{borrower.fullName}</p>
														<p class="text-xs text-gray-500">{borrower.email}</p>
													</div>
												</div>
												<div class="flex items-center gap-3">
													<span class="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-800">
														{borrower.yearLevel} • Block {borrower.block}
													</span>
													<button
														onclick={() => viewStudentProfile(borrower.studentId)}
														class="inline-flex items-center gap-1 text-xs font-bold text-pink-600 hover:text-pink-700 transition-colors"
													>
														View Profile <ChevronRight size={14} />
													</button>
												</div>
											</div>

											<!-- Requests List for this student -->
											<div class="mt-4 space-y-3">
												<p class="text-xs font-bold uppercase tracking-wider text-gray-400">Request Logs</p>
												{#each borrower.requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as req}
													<div class="rounded-lg bg-white border border-gray-200/80 p-3.5 space-y-2">
														<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
															<div class="flex items-center gap-2">
																<span class="font-mono font-bold text-pink-600">REQ-{req.requestId.slice(-6).toUpperCase()}</span>
																<span class="text-gray-400 font-medium">{formatTimestamp(req.createdAt)}</span>
															</div>
															<div class="flex items-center gap-2">
																<span class="font-semibold text-gray-700">Qty: <strong class="text-pink-600">x{req.quantity}</strong></span>
																{@html getStatusBadge(req.status)}
															</div>
														</div>
														{#if req.purpose}
															<p class="text-xs text-gray-600 bg-gray-50 rounded px-2.5 py-1.5 font-medium border border-gray-100">
																<span class="text-gray-400 font-semibold block text-[10px] uppercase tracking-wider mb-0.5">Purpose</span>
																{req.purpose}
															</p>
														{/if}
														<div class="text-[11px] text-gray-500 flex gap-4">
															<div>
																<span class="font-semibold">Borrow Date:</span> {formatShortDate(req.borrowDate)}
															</div>
															<div>
																<span class="font-semibold">Return Date:</span> {formatShortDate(req.returnDate)}
															</div>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<!-- LIST OVERVIEW WITH TABS (REQUESTS TAB / ITEMS TAB / STUDENT DIRECTORY TAB) -->
				<!-- Navigation Tabs for Requests vs. Items vs. Students -->
				<div class="border-b border-gray-200">
					<nav class="-mb-px flex gap-6" aria-label="History sub-navigation">
						<button
							onclick={() => { activeMainTab = 'requests'; currentPage = 1; }}
							class="border-b-2 pb-4 text-sm font-semibold transition-all {activeMainTab === 'requests'
								? 'border-pink-500 text-pink-600'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
						>
							Request Logs ({totalRequestsCount})
						</button>
						<button
							onclick={() => { activeMainTab = 'items'; currentPage = 1; }}
							class="border-b-2 pb-4 text-sm font-semibold transition-all {activeMainTab === 'items'
								? 'border-pink-500 text-pink-600'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
						>
							Requested Items ({itemsDirectory.length})
						</button>
						<button
							onclick={() => { activeMainTab = 'students'; currentPage = 1; }}
							class="border-b-2 pb-4 text-sm font-semibold transition-all {activeMainTab === 'students'
								? 'border-pink-500 text-pink-600'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
						>
							Students Directory ({studentDirectory.length})
						</button>
						<button
							onclick={() => { activeMainTab = 'adjustments'; currentPage = 1; void fetchAdjustments(); }}
							class="border-b-2 pb-4 text-sm font-semibold transition-all {activeMainTab === 'adjustments'
								? 'border-pink-500 text-pink-600'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
						>
							Item Adjustments ({adjustments.length})
						</button>
					</nav>
				</div>

				<!-- Search & Filters Container -->
				<div class="grid grid-cols-1 gap-4 md:grid-cols-12">
					<!-- Search -->
					<div class="relative md:col-span-6">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<Search size={16} class="text-gray-400" />
						</div>
						<input
							type="text"
							bind:value={searchQuery}
							placeholder={activeMainTab === 'requests' 
								? 'Search by items, students, purpose...' 
								: activeMainTab === 'items'
									? 'Search requested items by name or category...'
									: activeMainTab === 'adjustments'
										? 'Search adjustment logs by item, reason, user...'
										: 'Search student directory by name or email...'}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-xs transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
						/>
					</div>

					{#if activeMainTab === 'requests'}
						<!-- Status Filter -->
						<div class="md:col-span-3">
							<select
								bind:value={statusFilter}
								class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 shadow-xs focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
							>
								<option value="">All Statuses</option>
								<option value="returned">Returned</option>
								<option value="borrowed">Borrowed</option>
								<option value="pending_instructor">Pending Instructor</option>
								<option value="approved_instructor">Approved by Instructor</option>
								<option value="ready_for_pickup">Ready for Pickup</option>
								<option value="missing">Missing</option>
								<option value="resolved">Resolved</option>
								<option value="rejected">Rejected</option>
							</select>
						</div>

						<!-- Location Filter -->
						<div class="md:col-span-3">
							<select
								bind:value={locationFilter}
								class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 shadow-xs focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
							>
								<option value="">All Locations</option>
								<option value="school">In-School</option>
								<option value="outdoor">Outdoor/Off-Campus</option>
							</select>
						</div>
					{/if}
				</div>

				<!-- Content Card -->
				<div class="rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden">
					{#if activeMainTab === 'requests'}
						<!-- REQUESTS LIST TABLE -->
						{#if paginatedRequests.length === 0}
							<div class="py-16 text-center">
								<FileText class="mx-auto h-12 w-12 text-gray-300" />
								<h3 class="mt-4 text-base font-semibold text-gray-900">No requests found</h3>
								<p class="mt-1 text-sm text-gray-500">Try adjusting your filters or search query.</p>
							</div>
						{:else}
							<div class="overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
											<th class="px-6 py-4">Request ID</th>
											<th class="px-6 py-4">Student</th>
											<th class="px-6 py-4">Items Requested</th>
											<th class="px-6 py-4">Borrow Date</th>
											<th class="px-6 py-4">Status</th>
											<th class="px-6 py-4 text-right">Actions</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-100">
										{#each paginatedRequests as req}
											<tr class="hover:bg-gray-50/50 transition-colors">
												<!-- ID -->
												<td class="px-6 py-4 whitespace-nowrap">
													<span class="font-mono text-xs font-bold text-pink-600">REQ-{req.id.slice(-6).toUpperCase()}</span>
													<div class="text-[10px] text-gray-400 mt-0.5">{formatTimestamp(req.createdAt)}</div>
												</td>
												
												<!-- Student Profile Quick view link -->
												<td class="px-6 py-4">
													{#if req.student}
														<button 
															onclick={() => viewStudentProfile(req.studentId)}
															class="flex items-center gap-3 text-left group focus:outline-none"
															title="View student all-time request profile"
														>
															<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-50 text-xs font-bold text-pink-700 ring-2 ring-pink-100 group-hover:scale-105 transition-transform">
																{#if req.student.profilePhotoUrl}
																	<img src={req.student.profilePhotoUrl} alt={req.student.fullName} class="h-full w-full object-cover" />
																{:else}
																	{req.student.fullName?.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')}
																{/if}
															</div>
															<div class="min-w-0">
																<p class="truncate text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">
																	{req.student.fullName}
																</p>
																<p class="truncate text-xs text-gray-500">{req.student.email}</p>
															</div>
														</button>
													{:else}
														<span class="text-xs text-gray-400">N/A</span>
													{/if}
												</td>

												<!-- Items requested list -->
												<td class="px-6 py-4">
													<div class="flex flex-col gap-1 max-w-[280px]">
														{#each req.items as item}
															<span class="truncate text-xs text-gray-700">
																{item.name} <strong class="text-pink-600 ml-1">x{item.quantity}</strong>
															</span>
														{/each}
													</div>
												</td>

												<!-- Date range -->
												<td class="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
													<div class="font-medium">{formatShortDate(req.borrowDate)}</div>
													<div class="text-[10px] text-gray-400">to {formatShortDate(req.returnDate)}</div>
												</td>

												<!-- Status -->
												<td class="px-6 py-4 whitespace-nowrap">
													{@html getStatusBadge(req.status)}
												</td>

												<!-- Action Link to Drilldown Profile -->
												<td class="px-6 py-4 whitespace-nowrap text-right pr-6">
													<button
														onclick={() => viewStudentProfile(req.studentId)}
														class="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors"
													>
														View Profile <ChevronRight size={14} />
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{:else if activeMainTab === 'items'}
						<!-- REQUESTED ITEMS LIST TABLE -->
						{#if paginatedItems.length === 0}
							<div class="py-16 text-center">
								<Package class="mx-auto h-12 w-12 text-gray-300" />
								<h3 class="mt-4 text-base font-semibold text-gray-900">No requested items found</h3>
								<p class="mt-1 text-sm text-gray-500">Try adjusting your search query.</p>
							</div>
						{:else}
							<div class="overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
											<th class="px-6 py-4">Item</th>
											<th class="px-6 py-4">Category</th>
											<th class="px-6 py-4 text-center">Total Quantity Requested</th>
											<th class="px-6 py-4 text-center">Request Count</th>
											<th class="px-6 py-4 text-center">Unique Borrowers</th>
											<th class="px-6 py-4 text-right pr-6">Actions</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-100">
										{#each paginatedItems as item}
											<tr class="hover:bg-gray-50/50 transition-colors">
												<td class="px-6 py-4 whitespace-nowrap">
													<button 
														onclick={() => viewItemDetail(item.itemId)}
														class="flex items-center gap-3 text-left group focus:outline-none"
														title="View item detailed request logs"
													>
														<div class="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 ring-2 ring-gray-100 group-hover:scale-105 transition-transform">
															{#if item.picture}
																<img src={item.picture} alt={item.name} class="h-full w-full object-cover" />
															{:else}
																<div class="h-full w-full overflow-hidden">
																	<ItemImagePlaceholder size="sm" />
																</div>
															{/if}
														</div>
														<span class="font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">{item.name}</span>
													</button>
												</td>
												<td class="px-6 py-4 text-gray-600">{item.category || 'N/A'}</td>
												<td class="px-6 py-4 text-center font-bold text-gray-900 tabular-nums">{item.totalQuantityRequested}</td>
												<td class="px-6 py-4 text-center font-medium text-gray-600 tabular-nums">{item.totalRequestsCount}</td>
												<td class="px-6 py-4 text-center font-medium text-gray-600 tabular-nums">{Object.keys(item.students).length}</td>
												<td class="px-6 py-4 whitespace-nowrap text-right pr-6">
													<button
														onclick={() => viewItemDetail(item.itemId)}
														class="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors"
													>
														View Details <ChevronRight size={14} />
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{:else if activeMainTab === 'students'}
						<!-- STUDENTS DIRECTORY VIEW -->
						{#if paginatedStudents.length === 0}
							<div class="py-16 text-center">
								<User class="mx-auto h-12 w-12 text-gray-300" />
								<h3 class="mt-4 text-base font-semibold text-gray-900">No students found</h3>
								<p class="mt-1 text-sm text-gray-500">Try matching on student name or email.</p>
							</div>
						{:else}
							<div class="overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
											<th class="px-6 py-4">Student</th>
											<th class="px-6 py-4">Year & Block</th>
											<th class="px-6 py-4 text-center">Total Requests</th>
											<th class="px-6 py-4 text-center">Total Items Requested</th>
											<th class="px-6 py-4 text-right pr-6">All-Time Profile</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-100">
										{#each paginatedStudents as s}
											<tr class="hover:bg-gray-50/50 transition-colors">
												<!-- Student info -->
												<td class="px-6 py-4 whitespace-nowrap">
													<div class="flex items-center gap-3">
														<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-bold text-pink-700 ring-2 ring-pink-50">
															{#if s.profilePhotoUrl}
																<img src={s.profilePhotoUrl} alt={s.fullName} class="h-full w-full object-cover" />
															{:else}
																{s.fullName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')}
															{/if}
														</div>
														<div>
															<p class="text-sm font-bold text-gray-900">{s.fullName}</p>
															<p class="text-xs text-gray-500">{s.email}</p>
														</div>
													</div>
												</td>

												<!-- Class info -->
												<td class="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
													<span class="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
														{s.yearLevel} • Block {s.block}
													</span>
												</td>

												<!-- Requests count -->
												<td class="px-6 py-4 text-center font-semibold text-gray-900 tabular-nums">
													{s.totalRequests}
												</td>

												<!-- Items count -->
												<td class="px-6 py-4 text-center font-semibold text-gray-900 tabular-nums">
													{s.totalItemsRequested}
												</td>

												<!-- Action Link -->
												<td class="px-6 py-4 whitespace-nowrap text-right pr-6">
													<button
														onclick={() => viewStudentProfile(s.studentId)}
														class="inline-flex items-center gap-1 text-xs font-bold text-pink-600 hover:text-pink-700 transition-colors"
													>
														View Profile <ChevronRight size={14} />
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{:else if activeMainTab === 'adjustments'}
						<!-- ITEM ADJUSTMENTS AUDIT TRAIL TAB -->
						{#if paginatedAdjustments.length === 0}
							<div class="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-xs">
								<Sliders size={36} class="mx-auto mb-3 text-gray-300" />
								<h3 class="text-sm font-semibold text-gray-900">No Item Adjustment Logs</h3>
								<p class="mt-1 text-xs text-gray-500">No stock adjustment activity has been recorded yet.</p>
							</div>
						{:else}
							<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
								<table class="w-full text-left text-sm text-gray-700">
									<thead class="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase border-b border-gray-200">
										<tr>
											<th class="px-6 py-3.5">Log ID / Ref</th>
											<th class="px-6 py-3.5">Equipment / Item</th>
											<th class="px-6 py-3.5">Adjustment Type</th>
											<th class="px-6 py-3.5 text-center">Quantity Change</th>
											<th class="px-6 py-3.5">Reason / Audit Notes</th>
											<th class="px-6 py-3.5">Adjusted By</th>
											<th class="px-6 py-3.5 text-right pr-6">Timestamp</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-100">
										{#each paginatedAdjustments as adj}
											<tr class="transition-colors hover:bg-gray-50/50">
												<td class="px-6 py-4 font-mono text-xs font-bold text-pink-600">
													{adj.id.slice(0, 10).toUpperCase()}
												</td>
												<td class="px-6 py-4 font-semibold text-gray-900">
													<div class="flex items-center gap-2">
														<Package size={15} class="text-gray-400 shrink-0" />
														<span>{adj.itemName}</span>
													</div>
												</td>
												<td class="px-6 py-4">
													{#if adj.action === 'add'}
														<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
															<ArrowUpRight size={13} /> Restock / Add Stock
														</span>
													{:else}
														<span class="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-700">
															<ArrowDownRight size={13} /> Deduct / Subtract Stock
														</span>
													{/if}
												</td>
												<td class="px-6 py-4 text-center font-mono font-bold {adj.action === 'add' ? 'text-emerald-600' : 'text-red-600'}">
													{adj.action === 'add' ? '+' : '-'}{adj.quantity} {adj.quantity === 1 ? 'unit' : 'units'}
												</td>
												<td class="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
													{adj.reason || 'Manual stock adjustment'}
												</td>
												<td class="px-6 py-4 text-xs font-medium text-gray-900">
													<span class="inline-flex items-center gap-1">
														<User size={13} class="text-gray-400" />
														{adj.adjustedBy}
													</span>
												</td>
												<td class="px-6 py-4 text-xs text-gray-500 whitespace-nowrap text-right pr-6">
													{formatTimestamp(adj.timestamp)}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{/if}

					<!-- Pagination Section -->
					{#if totalItems > itemsPerPage}
						<div class="border-t border-gray-100 px-6 py-4">
							<Pagination
								currentPage={currentPage}
								totalPages={totalPages}
								totalItems={totalItems}
								itemsPerPage={itemsPerPage}
								onPageChange={(p) => currentPage = p}
							/>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}
</div>
