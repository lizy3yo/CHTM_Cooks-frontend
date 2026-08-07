<script lang="ts">
	import { onMount } from 'svelte';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import type { BorrowRequestRecord, BorrowRequestStatus } from '$lib/api/borrowRequests';
	import { catalogAPI } from '$lib/api/catalog';
	import { toastStore } from '$lib/stores/toast';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import { 
		Search, 
		SlidersHorizontal, 
		CheckCircle2, 
		XCircle, 
		HelpCircle, 
		Calendar, 
		MapPin, 
		FileText, 
		Package, 
		ChevronRight,
		Clock,
		ArrowRight
	} from 'lucide-svelte';

	// Filters
	let searchQuery = $state('');
	let statusFilter = $state<string>(''); // empty means all processed statuses
	let startDateFilter = $state('');
	let endDateFilter = $state('');
	let showFilters = $state(false);

	// Pagination
	let currentPage = $state(1);
	const itemsPerPage = 10;

	// State
	let requests = $state<BorrowRequestRecord[]>([]);
	let totalItems = $state(0);
	let loading = $state(true);

	// KPI Stats
	let countTotal = $state(0);
	let countReturned = $state(0);
	let countResolved = $state(0);
	let countCancelled = $state(0);
	let countRejected = $state(0);
	let statsLoading = $state(true);

	// Detail Modal
	let showDetailModal = $state(false);
	let selectedRequest = $state<BorrowRequestRecord | null>(null);
	let itemPictureCache = $state<Map<string, string>>(new Map());

	const processedStatuses: BorrowRequestStatus[] = ['returned', 'resolved', 'cancelled', 'rejected'];

	async function loadStats() {
		try {
			statsLoading = true;
			const [returnedRes, resolvedRes, cancelledRes, rejectedRes] = await Promise.all([
				borrowRequestsAPI.list({ statuses: ['returned'], limit: 1 }),
				borrowRequestsAPI.list({ statuses: ['resolved'], limit: 1 }),
				borrowRequestsAPI.list({ statuses: ['cancelled'], limit: 1 }),
				borrowRequestsAPI.list({ statuses: ['rejected'], limit: 1 })
			]);
			countReturned = returnedRes.total;
			countResolved = resolvedRes.total;
			countCancelled = cancelledRes.total;
			countRejected = rejectedRes.total;
			countTotal = countReturned + countResolved + countCancelled + countRejected;
		} catch (err: any) {
			console.error('Failed to load stats', err);
		} finally {
			statsLoading = false;
		}
	}

	async function loadRequests(resetPage = false) {
		if (resetPage) {
			currentPage = 1;
		}
		try {
			loading = true;
			const activeStatuses = statusFilter ? [statusFilter as BorrowRequestStatus] : processedStatuses;
			const response = await borrowRequestsAPI.list({
				statuses: activeStatuses,
				page: currentPage,
				limit: itemsPerPage
			});
			requests = response.requests;
			totalItems = response.total;
			await backfillItemPictures();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load processed requests');
		} finally {
			loading = false;
		}
	}

	async function backfillItemPictures(): Promise<void> {
		const missingIds = new Set<string>();
		for (const req of requests) {
			for (const item of req.items) {
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
			// fallback silently
		}
	}

	onMount(() => {
		loadStats();
		loadRequests();
	});

	// Derived filtering for client-side search and date range
	const filteredRequests = $derived.by(() => {
		let filtered = requests;

		if (startDateFilter) {
			const start = new Date(startDateFilter);
			filtered = filtered.filter(r => new Date(r.createdAt) >= start);
		}
		if (endDateFilter) {
			const end = new Date(endDateFilter);
			end.setHours(23, 59, 59, 999);
			filtered = filtered.filter(r => new Date(r.createdAt) <= end);
		}

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(r => {
				const studentName = r.student?.fullName || r.student?.firstName || '';
				const studentEmail = r.student?.email || '';
				const reqId = r.id || '';
				const itemsStr = r.items.map(item => item.name).join(' ');

				return (
					studentName.toLowerCase().includes(q) ||
					studentEmail.toLowerCase().includes(q) ||
					reqId.toLowerCase().includes(q) ||
					itemsStr.toLowerCase().includes(q)
				);
			});
		}

		return filtered;
	});

	function formatTimestamp(dateStr: Date | string): string {
		if (!dateStr) return 'N/A';
		const d = new Date(dateStr);
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(d);
	}

	function formatRequestId(id: string): string {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	function getStatusBadge(status: string): string {
		const colors: Record<string, string> = {
			returned: 'bg-green-100 text-green-800 border-green-200',
			resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
			cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
			rejected: 'bg-red-100 text-red-800 border-red-200 border'
		};
		return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
	}

	function getStatusLabel(status: string): string {
		if (status === 'rejected') return 'DECLINED';
		return status.toUpperCase();
	}

	function openRequestDetailModal(request: BorrowRequestRecord) {
		selectedRequest = request;
		showDetailModal = true;
	}

	function closeRequestDetailModal() {
		showDetailModal = false;
		selectedRequest = null;
	}
</script>

<div class="space-y-6">
	<!-- KPI summary strip -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="rounded-xl border border-gray-250 bg-white p-5 shadow-sm">
			<p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Processed</p>
			{#if statsLoading}
				<div class="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200"></div>
			{:else}
				<p class="mt-2 text-3xl font-bold text-gray-900">{countTotal}</p>
			{/if}
			<p class="mt-1 text-xs text-gray-500">Overall finalized requests</p>
		</div>

		<div class="rounded-xl border border-gray-255 bg-white p-5 shadow-sm">
			<p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Returned</p>
			{#if statsLoading}
				<div class="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200"></div>
			{:else}
				<p class="mt-2 text-3xl font-bold text-green-600">{countReturned}</p>
			{/if}
			<p class="mt-1 text-xs text-gray-500">Successfully returned</p>
		</div>

		<div class="rounded-xl border border-gray-255 bg-white p-5 shadow-sm">
			<p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Resolved</p>
			{#if statsLoading}
				<div class="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200"></div>
			{:else}
				<p class="mt-2 text-3xl font-bold text-emerald-600">{countResolved}</p>
			{/if}
			<p class="mt-1 text-xs text-gray-500">Obligations resolved</p>
		</div>

		<div class="rounded-xl border border-gray-255 bg-white p-5 shadow-sm">
			<p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Cancelled</p>
			{#if statsLoading}
				<div class="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200"></div>
			{:else}
				<p class="mt-2 text-3xl font-bold text-gray-500">{countCancelled}</p>
			{/if}
			<p class="mt-1 text-xs text-gray-500">Cancelled by student</p>
		</div>

		<div class="rounded-xl border border-gray-255 bg-white p-5 shadow-sm">
			<p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Declined</p>
			{#if statsLoading}
				<div class="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200"></div>
			{:else}
				<p class="mt-2 text-3xl font-bold text-rose-600">{countRejected}</p>
			{/if}
			<p class="mt-1 text-xs text-gray-500">Rejected applications</p>
		</div>
	</div>

	<!-- Controls & Filter Panel -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<!-- Search Bar -->
			<div class="relative flex-1">
				<Search size={18} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
				<input
					type="text"
					placeholder="Search by student, email, request ID, item name..."
					bind:value={searchQuery}
					class="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
				/>
			</div>

			<!-- Buttons -->
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (showFilters = !showFilters)}
					class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 {showFilters ? 'border-pink-500 text-pink-600 bg-pink-50/20' : ''}"
				>
					<SlidersHorizontal size={16} />
					<span>Filters</span>
				</button>
			</div>
		</div>

		<!-- Expanded Filters -->
		{#if showFilters}
			<div class="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3">
				<div>
					<label for="status-select" class="block text-xs font-semibold text-gray-500 uppercase">Status</label>
					<select
						id="status-select"
						bind:value={statusFilter}
						onchange={() => loadRequests(true)}
						class="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
					>
						<option value="">All Processed Statuses</option>
						<option value="returned">Returned</option>
						<option value="resolved">Resolved</option>
						<option value="cancelled">Cancelled</option>
						<option value="rejected">Declined (Rejected)</option>
					</select>
				</div>

				<div>
					<label for="start-date-input" class="block text-xs font-semibold text-gray-500 uppercase">Start Date</label>
					<input
						type="date"
						id="start-date-input"
						bind:value={startDateFilter}
						class="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
					/>
				</div>

				<div>
					<label for="end-date-input" class="block text-xs font-semibold text-gray-500 uppercase">End Date</label>
					<input
						type="date"
						id="end-date-input"
						bind:value={endDateFilter}
						class="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
					/>
				</div>
			</div>
			
			<div class="mt-3 flex justify-end">
				<button
					type="button"
					onclick={() => {
						statusFilter = '';
						startDateFilter = '';
						endDateFilter = '';
						searchQuery = '';
						loadRequests(true);
					}}
					class="text-xs font-bold text-pink-600 hover:text-pink-700"
				>
					Clear Filters
				</button>
			</div>
		{/if}
	</div>

	<!-- Data Table Section -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
		{#if loading}
			<div class="space-y-4 p-6">
				{#each Array(4) as _}
					<div class="h-12 w-full animate-pulse rounded bg-gray-100"></div>
				{/each}
			</div>
		{:else if filteredRequests.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<div class="rounded-full bg-pink-50 p-4 text-pink-600">
					<FileText size={32} />
				</div>
				<h3 class="mt-4 text-base font-bold text-gray-900">No processed requests found</h3>
				<p class="mt-1 text-sm text-gray-500">
					{#if searchQuery || statusFilter || startDateFilter || endDateFilter}
						No requests match your current filters. Try refining your criteria.
					{:else}
						Fully processed student requests will appear here.
					{/if}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm border-collapse">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
							<th class="w-12 py-3.5 px-4 text-center">#</th>
							<th class="py-3.5 px-4">Request ID</th>
							<th class="py-3.5 px-4">Student</th>
							<th class="py-3.5 px-4">Items</th>
							<th class="py-3.5 px-4">Status</th>
							<th class="py-3.5 px-4">Processed Date</th>
							<th class="w-12 py-3.5 px-4"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-150">
						{#each filteredRequests as request, i}
							<tr
								onclick={() => openRequestDetailModal(request)}
								class="group cursor-pointer hover:bg-gray-50/80 transition-colors"
							>
								<td class="py-4 px-4 text-center text-xs font-medium text-gray-500">
									{(currentPage - 1) * itemsPerPage + i + 1}
								</td>
								<td class="py-4 px-4 font-mono text-xs font-bold text-gray-900">
									{formatRequestId(request.id)}
								</td>
								<td class="py-4 px-4">
									{#if request.student}
										<div class="flex items-center gap-3">
											<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-2 ring-pink-200">
												{#if request.student.profilePhotoUrl}
													<img
														src={request.student.profilePhotoUrl}
														alt={request.student.fullName || 'Student'}
														class="h-full w-full object-cover"
													/>
												{:else}
													{(request.student.fullName || request.student.firstName || 'ST')
														.split(' ')
														.filter(Boolean)
														.slice(0, 2)
														.map((part) => part[0]?.toUpperCase() || '')
														.join('')}
												{/if}
											</div>
											<div>
												<div class="font-semibold text-gray-900">
													{request.student.fullName || `${request.student.firstName || ''} ${request.student.lastName || ''}`.trim() || 'N/A'}
												</div>
												<div class="text-xs text-gray-500">{request.student.email}</div>
											</div>
										</div>
									{:else}
										<span class="text-gray-500">N/A</span>
									{/if}
								</td>
								<td class="py-4 px-4">
									{#if request.items.length === 1}
										<span class="font-medium text-gray-800">{request.items[0].name}</span>
										<span class="text-xs text-gray-500 font-bold ml-1">x{request.items[0].quantity}</span>
									{:else}
										<span class="font-semibold text-gray-800">{request.items.length} items</span>
										<div class="text-xs text-gray-500 truncate max-w-xs">
											{request.items.map(item => item.name).join(', ')}
										</div>
									{/if}
								</td>
								<td class="py-4 px-4">
									<span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold {getStatusBadge(request.status)}">
										<span class="h-1.5 w-1.5 rounded-full {request.status === 'returned' || request.status === 'resolved' ? 'bg-green-500' : request.status === 'cancelled' ? 'bg-gray-400' : 'bg-red-500'}"></span>
										{getStatusLabel(request.status)}
									</span>
								</td>
								<td class="py-4 px-4 text-xs font-semibold text-gray-500">
									{formatTimestamp(request.createdAt)}
								</td>
								<td class="py-4 px-4 text-center">
									<ChevronRight size={16} class="text-gray-400 transition-transform group-hover:translate-x-0.5" />
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination footer -->
			{#if totalItems > itemsPerPage}
				<div class="border-t border-gray-200 px-4 py-3">
					<Pagination
						currentPage={currentPage}
						totalPages={Math.ceil(totalItems / itemsPerPage)}
						totalItems={totalItems}
						itemsPerPage={itemsPerPage}
						onPageChange={(p) => {
							currentPage = p;
							loadRequests();
						}}
					/>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Request Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
		<button
			type="button"
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={closeRequestDetailModal}
			aria-label="Close modal background"
		></button>
		
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="animate-scaleIn relative w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-6 py-5 backdrop-blur-sm flex justify-between items-center">
					<div class="flex items-center gap-3">
						<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-md">
							<FileText size={20} class="text-white" />
						</div>
						<div>
							<h3 class="text-base font-bold text-gray-900 sm:text-lg">
								{formatRequestId(selectedRequest.id)}
							</h3>
							<p class="text-xs text-gray-500">Processed Transaction Detail</p>
						</div>
					</div>

					<button
						type="button"
						onclick={closeRequestDetailModal}
						class="rounded-xl border border-gray-250 bg-gray-50 p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
						aria-label="Close detail modal"
					>
						✕
					</button>
				</div>

				<!-- Content -->
				<div class="max-h-[65vh] overflow-y-auto p-6 space-y-6">
					<!-- Student and status info -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
							<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Student Borrower</h4>
							{#if selectedRequest.student}
								<div class="mt-3 flex items-center gap-3">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700 ring-2 ring-pink-200">
										{#if selectedRequest.student.profilePhotoUrl}
											<img src={selectedRequest.student.profilePhotoUrl} alt="Borrower" class="h-full w-full object-cover" />
										{:else}
											{(selectedRequest.student.fullName || selectedRequest.student.firstName || 'ST')
												.split(' ')
												.filter(Boolean)
												.slice(0, 2)
												.map((part) => part[0]?.toUpperCase() || '')
												.join('')}
										{/if}
									</div>
									<div>
										<div class="text-sm font-bold text-gray-900">{selectedRequest.student.fullName}</div>
										<div class="text-xs text-gray-500">{selectedRequest.student.email}</div>
										{#if selectedRequest.student.yearLevel || selectedRequest.student.block}
											<div class="text-xs font-semibold text-gray-600 mt-0.5">
												Year {selectedRequest.student.yearLevel || 'N/A'} • Block {selectedRequest.student.block || 'N/A'}
											</div>
										{/if}
									</div>
								</div>
							{:else}
								<p class="mt-2 text-sm text-gray-600">N/A</p>
							{/if}
						</div>

						<div class="rounded-xl border border-gray-200 p-4 bg-gray-50/50 flex flex-col justify-between">
							<div>
								<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Transaction Status</h4>
								<div class="mt-2.5">
									<span class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold {getStatusBadge(selectedRequest.status)}">
										<span class="h-2 w-2 rounded-full {selectedRequest.status === 'returned' || selectedRequest.status === 'resolved' ? 'bg-green-500' : selectedRequest.status === 'cancelled' ? 'bg-gray-400' : 'bg-red-500'}"></span>
										{getStatusLabel(selectedRequest.status)}
									</span>
								</div>
							</div>

							<div class="text-xs text-gray-500 mt-2 font-medium">
								Processed at: {formatTimestamp(selectedRequest.updatedAt)}
							</div>
						</div>
					</div>

					<!-- Details checklist / fields -->
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="rounded-xl border border-gray-200 p-3.5 bg-gray-50/30">
							<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
								<Calendar size={14} class="text-pink-500" />
								<span>Request Date</span>
							</div>
							<p class="mt-1 text-sm font-bold text-gray-900">{formatTimestamp(selectedRequest.createdAt)}</p>
						</div>

						<div class="rounded-xl border border-gray-200 p-3.5 bg-gray-50/30">
							<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
								<Clock size={14} class="text-pink-500" />
								<span>Borrow Period</span>
							</div>
							<p class="mt-1 text-sm font-bold text-gray-900">
								{new Date(selectedRequest.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								<ArrowRight size={12} class="inline mx-1 text-gray-400" />
								{new Date(selectedRequest.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
							</p>
						</div>

						<div class="rounded-xl border border-gray-200 p-3.5 bg-gray-50/30">
							<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
								<MapPin size={14} class="text-pink-500" />
								<span>Usage Location</span>
							</div>
							<p class="mt-1 text-sm font-bold text-gray-900 capitalize">
								{selectedRequest.usageLocation === 'school' ? 'In-School Use' : selectedRequest.usageLocation === 'outdoor' ? 'Outdoor Use' : 'N/A'}
							</p>
						</div>
					</div>

					<!-- Purpose -->
					<div class="rounded-xl border border-gray-200 p-4 bg-gray-50/30">
						<h4 class="text-xs font-bold uppercase tracking-wider text-gray-500">Purpose & Details</h4>
						<p class="mt-1 text-sm font-semibold text-gray-900 leading-relaxed">
							{selectedRequest.purpose || 'No purpose specified'}
						</p>
					</div>

					<!-- Rejection/Declined reason if any -->
					{#if selectedRequest.status === 'rejected' && (selectedRequest.rejectReason || selectedRequest.rejectionNotes)}
						<div class="rounded-xl border border-red-200 p-4 bg-red-50/40">
							<h4 class="text-xs font-bold uppercase tracking-wider text-red-700">Decline Reason</h4>
							{#if selectedRequest.rejectReason}
								<p class="mt-1 text-sm font-semibold text-red-900">
									{selectedRequest.rejectReason}
								</p>
							{/if}
							{#if selectedRequest.rejectionNotes && selectedRequest.rejectionNotes !== selectedRequest.rejectReason}
								<div class="mt-2 rounded-lg border border-red-200/80 bg-red-100/60 p-2.5">
									<p class="text-[10px] font-bold text-red-900 uppercase tracking-wider">Instructor Note</p>
									<p class="mt-0.5 text-xs text-red-800 leading-relaxed whitespace-pre-wrap">{selectedRequest.rejectionNotes}</p>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Requested Items Table -->
					<div>
						<h4 class="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
							Requested Items ({selectedRequest.items.length})
						</h4>
						<div class="overflow-hidden rounded-xl border border-gray-200">
							<div class="hidden sm:grid grid-cols-12 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
								<span class="col-span-8">Item Description</span>
								<span class="col-span-2 text-center">Item Code</span>
								<span class="col-span-2 text-center">Qty</span>
							</div>

							<div class="divide-y divide-gray-100 bg-white">
								{#each selectedRequest.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									{@const code = item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A'}
									<div class="grid items-center gap-3 p-3 sm:grid-cols-12 sm:p-4 hover:bg-gray-50/40 transition-colors">
										<div class="col-span-12 flex items-center gap-3 sm:col-span-8 min-w-0">
											<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
												{#if pic}
													<img src={pic} alt={item.name} class="h-full w-full object-cover" />
												{:else}
													<ItemImagePlaceholder size="sm" />
												{/if}
											</div>
											<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
										</div>

										<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-2 sm:border-0 sm:pt-0">
											<span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:hidden">Code</span>
											<span class="font-mono text-xs font-semibold text-gray-600">{code}</span>
										</div>

										<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-2 sm:border-0 sm:pt-0 border-l border-gray-100 pl-3 sm:border-0 sm:pl-0">
											<span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:hidden">Qty</span>
											<span class="text-sm font-bold text-gray-900">{item.quantity}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="border-t border-gray-200 bg-gray-50 px-6 py-4 flex justify-end">
					<button
						type="button"
						onclick={closeRequestDetailModal}
						class="rounded-xl border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-100"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
