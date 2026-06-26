<script lang="ts">
	import { onMount } from 'svelte';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { inventoryItemsAPI, type InventoryItem } from '$lib/api/inventory';
	import { classCodesAPI, type ClassCodeResponse } from '$lib/api/classCodes';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import {
		Plus,
		Search,
		Users,
		Package,
		Clock,
		CheckCircle2,
		Trash2,
		Lock,
		AlertCircle,
		Calendar,
		MapPin,
		RotateCcw,
		FileText,
		ShieldAlert,
		Sparkles,
		ChevronRight,
		X,
		Info
	} from 'lucide-svelte';

	// ─── TYPES FOR STATE MANAGEMENT ──────────────────────────────────────────
	interface WalkInItem {
		id: string;
		name: string;
		category: string;
		quantity: number;
		selectedQty: number;
	}

	interface WalkInTransaction {
		id: string;
		studentName: string;
		studentId: string;
		email: string;
		classCode: string;
		purpose: string;
		usageLocation: 'school' | 'outdoor';
		borrowDate: string;
		returnDate: string;
		items: { itemId: string; name: string; quantity: number; category: string }[];
		status: 'borrowed' | 'returned' | 'missing';
		returnedAt?: string;
		notes?: string;
	}

	interface ConfidentialRequest {
		id: string;
		requesterName: string;
		requesterId: string;
		purpose: string;
		priority: 'Low' | 'Medium' | 'High' | 'Critical';
		confidentialityLevel: 'Confidential' | 'Strictly Confidential';
		borrowDate: string;
		returnDate: string;
		items: { itemId: string; name: string; quantity: number }[];
		status: 'preparing' | 'prepared' | 'dispatched' | 'resolved';
		dispatchedAt?: string;
		resolvedAt?: string;
		notes?: string;
	}

	// ─── STATE ───────────────────────────────────────────────────────────────
	let activeTab = $state<'walk-in' | 'confidential'>('walk-in');
	let loading = $state(true);

	// Collections loaded from APIs
	let studentsList = $state<UserResponse[]>([]);
	let adminList = $state<UserResponse[]>([]);
	let inventoryItems = $state<InventoryItem[]>([]);
	let classCodesList = $state<ClassCodeResponse[]>([]);

	// Alternative Transactions stored in localStorage
	let walkIns = $state<WalkInTransaction[]>([]);
	let confidentialRequests = $state<ConfidentialRequest[]>([]);

	// Filters
	let walkInSearchQuery = $state('');
	let walkInStatusFilter = $state<'all' | 'borrowed' | 'returned' | 'missing'>('all');
	let confidentialSearchQuery = $state('');
	let confidentialStatusFilter = $state<'all' | 'preparing' | 'dispatched' | 'resolved'>('all');

	// Modals toggles
	let showWalkInModal = $state(false);
	let showReturnModal = $state(false);
	let showConfidentialModal = $state(false);

	// --- Walk-in Checkout Form State ---
	let selectedStudent = $state<UserResponse | null>(null);
	let isCustomBorrower = $state(false);
	let customStudentName = $state('');
	let customStudentID = $state('');
	let customStudentEmail = $state('');
	let studentSearchVal = $state('');
	let showStudentDropdown = $state(false);

	let selectedClassCode = $state('');
	let usageLocation = $state<'school' | 'outdoor'>('school');
	let purpose = $state('');
	let returnDate = $state('');
	let itemSearchQuery = $state('');
	let walkInCart = $state<WalkInItem[]>([]);

	// --- Return Form State ---
	let selectedWalkIn = $state<WalkInTransaction | null>(null);
	let returnInspection = $state<
		Record<string, { status: 'good' | 'damaged' | 'missing'; notes: string }>
	>({});

	// --- Confidential Request Form State ---
	let selectedAdmin = $state<UserResponse | null>(null);
	let isCustomAdmin = $state(false);
	let customAdminName = $state('');
	let adminSearchVal = $state('');
	let showAdminDropdown = $state(false);

	let confidentialPurpose = $state('');
	let requestPriority = $state<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
	let confidentialityLevel = $state<'Confidential' | 'Strictly Confidential'>('Confidential');
	let confidentialReturnDate = $state('');
	let confidentialCart = $state<WalkInItem[]>([]);

	// Autocomplete searches
	const filteredStudents = $derived(
		studentsList.filter(
			(s) =>
				`${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearchVal.toLowerCase()) ||
				s.email.toLowerCase().includes(studentSearchVal.toLowerCase()) ||
				s.id.toLowerCase().includes(studentSearchVal.toLowerCase())
		)
	);

	const filteredAdmins = $derived(
		adminList.filter(
			(a) =>
				`${a.firstName} ${a.lastName}`.toLowerCase().includes(adminSearchVal.toLowerCase()) ||
				a.email.toLowerCase().includes(adminSearchVal.toLowerCase())
		)
	);

	const filteredInventory = $derived(
		inventoryItems.filter(
			(item) =>
				item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) &&
				!item.archived &&
				item.quantity + (item.donations ?? 0) > 0
		)
	);

	// Stats Computations
	const walkInStats = $derived.by(() => {
		const total = walkIns.length;
		const active = walkIns.filter((w) => w.status === 'borrowed').length;
		const returned = walkIns.filter((w) => w.status === 'returned').length;
		return { total, active, returned };
	});

	const confidentialStats = $derived.by(() => {
		const total = confidentialRequests.length;
		const pending = confidentialRequests.filter(
			(c) => c.status === 'preparing' || c.status === 'prepared'
		).length;
		const active = confidentialRequests.filter((c) => c.status === 'dispatched').length;
		return { total, pending, active };
	});

	// Filtered lists
	const displayWalkIns = $derived(
		walkIns.filter((w) => {
			const matchesSearch =
				w.studentName.toLowerCase().includes(walkInSearchQuery.toLowerCase()) ||
				w.studentId.toLowerCase().includes(walkInSearchQuery.toLowerCase()) ||
				w.items.some((i) => i.name.toLowerCase().includes(walkInSearchQuery.toLowerCase()));
			const matchesStatus = walkInStatusFilter === 'all' || w.status === walkInStatusFilter;
			return matchesSearch && matchesStatus;
		})
	);

	const displayConfidentialRequests = $derived(
		confidentialRequests.filter((c) => {
			const matchesSearch =
				c.requesterName.toLowerCase().includes(confidentialSearchQuery.toLowerCase()) ||
				c.purpose.toLowerCase().includes(confidentialSearchQuery.toLowerCase());
			const matchesStatus =
				confidentialStatusFilter === 'all' || c.status === confidentialStatusFilter;
			return matchesSearch && matchesStatus;
		})
	);

	// ─── INITIALIZATION ──────────────────────────────────────────────────────
	onMount(async () => {
		try {
			// Load data from APIs
			const [studentsRes, adminsRes, instructorsRes, inventoryRes, classesRes] = await Promise.all([
				usersAPI.getAll({ role: 'student', limit: 100 }),
				usersAPI.getAll({ role: 'superadmin', limit: 50 }),
				usersAPI.getAll({ role: 'instructor', limit: 50 }),
				inventoryItemsAPI.getAll({ limit: 100 }),
				classCodesAPI.getAll({ limit: 50 })
			]);

			studentsList = studentsRes.users || [];
			// Combine Superadmins and Instructors as administrators
			adminList = [...(adminsRes.users || []), ...(instructorsRes.users || [])];
			inventoryItems = inventoryRes.items || [];
			classCodesList = classesRes.classCodes || [];

			// Load Alternative Transactions from localStorage
			const savedWalkIns = localStorage.getItem('chtm_walk_in_transactions');
			if (savedWalkIns) {
				walkIns = JSON.parse(savedWalkIns);
			}

			const savedConfidential = localStorage.getItem('chtm_confidential_requests');
			if (savedConfidential) {
				confidentialRequests = JSON.parse(savedConfidential);
			}
		} catch (error) {
			console.error('Failed to load transaction data sources', error);
			toastStore.error('Could not load some references. Fallbacks enabled.', 'Warning');
		} finally {
			loading = false;
		}
	});

	function saveWalkIns() {
		localStorage.setItem('chtm_walk_in_transactions', JSON.stringify(walkIns));
	}

	function saveConfidential() {
		localStorage.setItem('chtm_confidential_requests', JSON.stringify(confidentialRequests));
	}

	// ─── ACTIONS: WALK-IN WORKFLOW ───────────────────────────────────────────
	function handleStudentSelect(student: UserResponse) {
		selectedStudent = student;
		studentSearchVal = `${student.firstName} ${student.lastName}`;
		showStudentDropdown = false;
		isCustomBorrower = false;
	}

	function addToWalkInCart(item: InventoryItem) {
		const exists = walkInCart.find((i) => i.id === item.id);
		if (exists) {
			if (exists.selectedQty < item.quantity + (item.donations ?? 0)) {
				exists.selectedQty += 1;
			} else {
				toastStore.warning(`Cannot exceed available stock for ${item.name}.`);
			}
		} else {
			walkInCart.push({
				id: item.id,
				name: item.name,
				category: item.category,
				quantity: item.quantity + (item.donations ?? 0),
				selectedQty: 1
			});
		}
	}

	function removeFromWalkInCart(itemId: string) {
		walkInCart = walkInCart.filter((i) => i.id !== itemId);
	}

	async function submitWalkInCheckout() {
		let name = '';
		let sid = '';
		let email = '';

		if (isCustomBorrower) {
			if (!customStudentName.trim() || !customStudentID.trim() || !customStudentEmail.trim()) {
				toastStore.error('All guest student details are required.');
				return;
			}
			name = customStudentName;
			sid = customStudentID;
			email = customStudentEmail;
		} else {
			if (!selectedStudent) {
				toastStore.error('Please select a student from the lookup database.');
				return;
			}
			name = `${selectedStudent.firstName} ${selectedStudent.lastName}`;
			sid = selectedStudent.id;
			email = selectedStudent.email;
		}

		if (!selectedClassCode) {
			toastStore.error('Class Code selection is required.');
			return;
		}

		if (walkInCart.length === 0) {
			toastStore.error('Please add at least one item to the borrow cart.');
			return;
		}

		if (!returnDate) {
			toastStore.error('Please specify a return date.');
			return;
		}

		const ok = await confirmStore.confirm({
			title: 'Confirm Walk-in Checkout',
			message: `Immediately checkout ${walkInCart.reduce((sum, i) => sum + i.selectedQty, 0)} items to student ${name}? Bypasses pre-approval.`,
			type: 'warning',
			confirmText: 'Release Items',
			cancelText: 'Cancel'
		});

		if (!ok) return;

		try {
			// Apply inventory stock adjustments in real-time
			for (const cartItem of walkInCart) {
				await inventoryItemsAPI.update(cartItem.id, {
					adjustmentType: 'subtract',
					quantity: cartItem.selectedQty,
					adjustmentReason: `Walk-in borrowing for ${name}`
				});
			}

			// Record transaction
			const newTx: WalkInTransaction = {
				id: 'W-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
				studentName: name,
				studentId: sid,
				email: email,
				classCode: selectedClassCode,
				purpose: purpose || 'Walk-in checkout',
				usageLocation,
				borrowDate: new Date().toISOString(),
				returnDate: new Date(returnDate).toISOString(),
				items: walkInCart.map((i) => ({
					itemId: i.id,
					name: i.name,
					quantity: i.selectedQty,
					category: i.category
				})),
				status: 'borrowed'
			};

			walkIns = [newTx, ...walkIns];
			saveWalkIns();

			// Refresh local inventory cache
			const freshInv = await inventoryItemsAPI.getAll({ limit: 100 });
			inventoryItems = freshInv.items || [];

			toastStore.success(`Items checked out successfully to ${name}.`);
			closeWalkInModal();
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to update inventory or log walk-in transaction.');
		}
	}

	function closeWalkInModal() {
		showWalkInModal = false;
		selectedStudent = null;
		isCustomBorrower = false;
		customStudentName = '';
		customStudentID = '';
		customStudentEmail = '';
		studentSearchVal = '';
		selectedClassCode = '';
		purpose = '';
		returnDate = '';
		walkInCart = [];
	}

	// ─── ACTIONS: RETURN & INSPECTION ────────────────────────────────────────
	function openReturnModal(tx: WalkInTransaction) {
		selectedWalkIn = tx;
		returnInspection = {};
		tx.items.forEach((i) => {
			returnInspection[i.itemId] = { status: 'good', notes: '' };
		});
		showReturnModal = true;
	}

	async function submitReturn() {
		if (!selectedWalkIn) return;

		const ok = await confirmStore.confirm({
			title: 'Complete Return Inspection',
			message:
				'Confirm all items are accounted for? This will immediately update stock levels based on inspection results.',
			type: 'info',
			confirmText: 'Submit Inspection',
			cancelText: 'Cancel'
		});

		if (!ok) return;

		try {
			let missingOrDamagedDetected = false;

			// Adjust inventory and obligations
			for (const item of selectedWalkIn.items) {
				const status = returnInspection[item.itemId].status;
				const notes = returnInspection[item.itemId].notes;

				if (status === 'good') {
					// Add back to inventory
					await inventoryItemsAPI.update(item.itemId, {
						adjustmentType: 'add',
						quantity: item.quantity,
						adjustmentReason: `Walk-in return: ${selectedWalkIn.studentName}`
					});
				} else {
					missingOrDamagedDetected = true;
					// Stock is NOT returned for missing/damaged.
					// Log the incident details in a professional way
					console.log(`[INCIDENT LOGGER] Item ${item.name} returned as ${status}: ${notes}`);
				}
			}

			// Update transaction status
			const updatedStatus = missingOrDamagedDetected ? 'missing' : 'returned';
			walkIns = walkIns.map((w) => {
				if (w.id === selectedWalkIn?.id) {
					return {
						...w,
						status: updatedStatus,
						returnedAt: new Date().toISOString(),
						notes: Object.values(returnInspection)
							.map((v) => v.notes)
							.filter(Boolean)
							.join('; ')
					};
				}
				return w;
			});

			saveWalkIns();

			// Refresh local inventory cache
			const freshInv = await inventoryItemsAPI.getAll({ limit: 100 });
			inventoryItems = freshInv.items || [];

			toastStore.success(
				missingOrDamagedDetected
					? 'Return processed. Incidents logged for missing/damaged items.'
					: 'All items returned in good condition. Stock restored.',
				'Return Logged'
			);

			showReturnModal = false;
			selectedWalkIn = null;
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to submit return records.');
		}
	}

	// ─── ACTIONS: CONFIDENTIAL WORKFLOW ──────────────────────────────────────
	function handleAdminSelect(admin: UserResponse) {
		selectedAdmin = admin;
		adminSearchVal = `${admin.firstName} ${admin.lastName}`;
		showAdminDropdown = false;
		isCustomAdmin = false;
	}

	function addToConfidentialCart(item: InventoryItem) {
		const exists = confidentialCart.find((i) => i.id === item.id);
		if (exists) {
			if (exists.selectedQty < item.quantity + (item.donations ?? 0)) {
				exists.selectedQty += 1;
			} else {
				toastStore.warning(`Cannot exceed available stock for ${item.name}.`);
			}
		} else {
			confidentialCart.push({
				id: item.id,
				name: item.name,
				category: item.category,
				quantity: item.quantity + (item.donations ?? 0),
				selectedQty: 1
			});
		}
	}

	function removeFromConfidentialCart(itemId: string) {
		confidentialCart = confidentialCart.filter((i) => i.id !== itemId);
	}

	async function submitConfidentialRequest() {
		let name = '';
		let aid = '';

		if (isCustomAdmin) {
			if (!customAdminName.trim()) {
				toastStore.error('Requester name is required.');
				return;
			}
			name = customAdminName;
			aid = 'guest-admin';
		} else {
			if (!selectedAdmin) {
				toastStore.error('Please select an administrator.');
				return;
			}
			name = `${selectedAdmin.firstName} ${selectedAdmin.lastName}`;
			aid = selectedAdmin.id;
		}

		if (!confidentialPurpose.trim()) {
			toastStore.error('Please specify a secure purpose.');
			return;
		}

		if (confidentialCart.length === 0) {
			toastStore.error('Please add at least one item.');
			return;
		}

		if (!confidentialReturnDate) {
			toastStore.error('Please specify a return deadline.');
			return;
		}

		const newRequest: ConfidentialRequest = {
			id: 'CR-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
			requesterName: name,
			requesterId: aid,
			purpose: confidentialPurpose,
			priority: requestPriority,
			confidentialityLevel,
			borrowDate: new Date().toISOString(),
			returnDate: new Date(confidentialReturnDate).toISOString(),
			items: confidentialCart.map((i) => ({
				itemId: i.id,
				name: i.name,
				quantity: i.selectedQty
			})),
			status: 'preparing'
		};

		confidentialRequests = [newRequest, ...confidentialRequests];
		saveConfidential();
		toastStore.success('Confidential request recorded successfully.');
		closeConfidentialModal();
	}

	function closeConfidentialModal() {
		showConfidentialModal = false;
		selectedAdmin = null;
		isCustomAdmin = false;
		customAdminName = '';
		adminSearchVal = '';
		confidentialPurpose = '';
		confidentialReturnDate = '';
		confidentialCart = [];
	}

	// Transition state machine for Confidential Requests
	async function transitionConfidential(
		req: ConfidentialRequest,
		newStatus: 'prepared' | 'dispatched' | 'resolved'
	) {
		const actionLabels = {
			prepared: 'Mark Items as Prepared',
			dispatched: 'Dispatch/Release Equipment',
			resolved: 'Mark Items as Returned/Resolved'
		};

		const confirmMsg = {
			prepared: 'Confirm that you have retrieved and packaged all requested assets?',
			dispatched:
				'Confirm release? This will immediately subtract stock quantities from the catalog.',
			resolved:
				'Confirm return? This will immediately restore the stock back to the active catalog.'
		};

		const ok = await confirmStore.confirm({
			title: actionLabels[newStatus],
			message: confirmMsg[newStatus],
			type: 'info',
			confirmText: 'Proceed',
			cancelText: 'Cancel'
		});

		if (!ok) return;

		try {
			if (newStatus === 'dispatched') {
				// Deduct stock
				for (const item of req.items) {
					await inventoryItemsAPI.update(item.itemId, {
						adjustmentType: 'subtract',
						quantity: item.quantity,
						adjustmentReason: `Confidential Dispatch: Req ${req.id}`
					});
				}
			} else if (newStatus === 'resolved') {
				// Restore stock
				for (const item of req.items) {
					await inventoryItemsAPI.update(item.itemId, {
						adjustmentType: 'add',
						quantity: item.quantity,
						adjustmentReason: `Confidential Return: Req ${req.id}`
					});
				}
			}

			// Update state
			confidentialRequests = confidentialRequests.map((c) => {
				if (c.id === req.id) {
					return {
						...c,
						status: newStatus,
						dispatchedAt: newStatus === 'dispatched' ? new Date().toISOString() : c.dispatchedAt,
						resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : c.resolvedAt
					};
				}
				return c;
			});
			saveConfidential();

			// Refresh active inventory list
			const freshInv = await inventoryItemsAPI.getAll({ limit: 100 });
			inventoryItems = freshInv.items || [];

			toastStore.success(`Request status updated to: ${newStatus.toUpperCase()}`);
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to execute state change for this confidential request.');
		}
	}
</script>

<svelte:head><title>Alternative Transactions - Custodian</title></svelte:head>

<div class="space-y-6">
	<!-- ─── HEADER ──────────────────────────────────────────────────────────── -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Alternative Transactions</h1>
			<p class="mt-1 text-sm text-gray-500">
				Dedicated workflows for desk walk-ins and confidential admin operations.
			</p>
		</div>

		<!-- Action buttons -->
		<div class="flex gap-2">
			{#if activeTab === 'walk-in'}
				<button
					type="button"
					onclick={() => (showWalkInModal = true)}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
				>
					<Plus size={16} /> Process Walk-in
				</button>
			{:else}
				<button
					type="button"
					onclick={() => (showConfidentialModal = true)}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
				>
					<Lock size={15} /> Log Confidential Request
				</button>
			{/if}
		</div>
	</div>

	<!-- ─── STATS CARDS ─────────────────────────────────────────────────────── -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<!-- Card 1 -->
		<div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold tracking-wider text-gray-400 uppercase"
					>Total Walk-ins</span
				>
				<div class="rounded-lg bg-pink-50 p-2 text-pink-600">
					<Users size={16} />
				</div>
			</div>
			<div class="mt-4 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-gray-900">{walkInStats.total}</span>
				<span class="text-xs text-gray-500">records logged</span>
			</div>
		</div>

		<!-- Card 2 -->
		<div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold tracking-wider text-gray-400 uppercase"
					>Active Walk-in Borrows</span
				>
				<div class="rounded-lg bg-amber-50 p-2 text-amber-600">
					<Clock size={16} />
				</div>
			</div>
			<div class="mt-4 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-amber-600">{walkInStats.active}</span>
				<span class="text-xs text-gray-500">out of laboratory</span>
			</div>
		</div>

		<!-- Card 3 -->
		<div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold tracking-wider text-gray-400 uppercase"
					>Confidential Admin Orders</span
				>
				<div class="rounded-lg bg-indigo-50 p-2 text-indigo-600">
					<Lock size={15} />
				</div>
			</div>
			<div class="mt-4 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-indigo-700"
					>{confidentialStats.pending + confidentialStats.active}</span
				>
				<span class="text-xs text-gray-500">active admin pipelines</span>
			</div>
		</div>
	</div>

	<!-- ─── TABS ────────────────────────────────────────────────────────────── -->
	<div class="border-b border-gray-200">
		<nav class="flex gap-6" aria-label="Tabs">
			<button
				type="button"
				onclick={() => (activeTab = 'walk-in')}
				class="cursor-pointer border-b-2 px-1 py-4 text-sm font-semibold transition-all {activeTab ===
				'walk-in'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Walk-in Transactions
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'confidential')}
				class="cursor-pointer border-b-2 px-1 py-4 text-sm font-semibold transition-all {activeTab ===
				'confidential'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Confidential Admin Requests
			</button>
		</nav>
	</div>

	<!-- ─── TAB CONTENT: WALK-IN TRANSACTIONS ───────────────────────────────── -->
	{#if activeTab === 'walk-in'}
		<div class="space-y-4">
			<!-- Filters & Search -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<!-- Search -->
				<div class="relative max-w-md flex-1">
					<span
						class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"
					>
						<Search size={16} />
					</span>
					<input
						type="text"
						bind:value={walkInSearchQuery}
						placeholder="Search student name, ID or items..."
						class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					/>
				</div>

				<!-- Status Filter -->
				<div class="flex items-center gap-2">
					<span class="text-xs font-semibold text-gray-400 uppercase">Filter:</span>
					<select
						bind:value={walkInStatusFilter}
						class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					>
						<option value="all">All Transactions</option>
						<option value="borrowed">Borrowed (Out)</option>
						<option value="returned">Returned (Cleared)</option>
						<option value="missing">Issues (Missing/Damaged)</option>
					</select>
				</div>
			</div>

			<!-- Main list table -->
			<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
				<table class="w-full min-w-max table-auto text-left">
					<thead class="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
						<tr>
							<th class="px-6 py-4">Transaction ID</th>
							<th class="px-6 py-4">Student/Borrower</th>
							<th class="px-6 py-4">Course / Class</th>
							<th class="px-6 py-4">Equipment / Qty</th>
							<th class="px-6 py-4">Checkout Date</th>
							<th class="px-6 py-4">Status</th>
							<th class="px-6 py-4 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 text-sm text-gray-700">
						{#if displayWalkIns.length === 0}
							<tr>
								<td colspan="7" class="py-12 text-center text-gray-400">
									<Users size={32} class="mx-auto mb-2 text-gray-300" />
									<p class="text-sm font-medium">No walk-in transactions found.</p>
								</td>
							</tr>
						{:else}
							{#each displayWalkIns as tx}
								<tr class="transition-colors hover:bg-gray-50/50">
									<td class="px-6 py-4 font-mono text-xs font-bold text-gray-900">{tx.id}</td>
									<td class="px-6 py-4">
										<div>
											<p class="font-medium text-gray-900">{tx.studentName}</p>
											<p class="text-xs text-gray-400">ID: {tx.studentId} · {tx.email}</p>
										</div>
									</td>
									<td class="px-6 py-4">
										<span class="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
											{tx.classCode}
										</span>
									</td>
									<td class="px-6 py-4">
										<div class="space-y-1">
											{#each tx.items as item}
												<p class="text-xs">
													<span class="font-bold text-pink-600">{item.quantity}x</span>
													{item.name}
												</p>
											{/each}
										</div>
									</td>
									<td class="px-6 py-4 text-xs">
										<p class="font-medium">
											{new Date(tx.borrowDate).toLocaleDateString()}
											{new Date(tx.borrowDate).toLocaleTimeString([], {
												hour: '2-digit',
												minute: '2-digit'
											})}
										</p>
										<p class="mt-0.5 text-gray-400">
											Due: {new Date(tx.returnDate).toLocaleDateString()}
										</p>
									</td>
									<td class="px-6 py-4">
										{#if tx.status === 'borrowed'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
											>
												<Clock size={10} /> Active Borrow
											</span>
										{:else if tx.status === 'returned'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
											>
												<CheckCircle2 size={10} /> Returned
											</span>
										{:else}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
											>
												<AlertCircle size={10} /> Inspected Issues
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 text-right">
										{#if tx.status === 'borrowed'}
											<button
												type="button"
												onclick={() => openReturnModal(tx)}
												class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-600 transition-colors hover:bg-pink-50"
											>
												<RotateCcw size={12} /> Process Return
											</button>
										{:else}
											<span class="text-xs text-gray-400 italic">
												Logged {tx.returnedAt ? new Date(tx.returnedAt).toLocaleDateString() : ''}
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- ─── TAB CONTENT: CONFIDENTIAL ADMIN REQUESTS ────────────────────────── -->
	{#if activeTab === 'confidential'}
		<div class="space-y-4">
			<!-- Filters & Search -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<!-- Search -->
				<div class="relative max-w-md flex-1">
					<span
						class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"
					>
						<Search size={16} />
					</span>
					<input
						type="text"
						bind:value={confidentialSearchQuery}
						placeholder="Search requester name, purpose..."
						class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					/>
				</div>

				<!-- Status Filter -->
				<div class="flex items-center gap-2">
					<span class="text-xs font-semibold text-gray-400 uppercase">Filter:</span>
					<select
						bind:value={confidentialStatusFilter}
						class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					>
						<option value="all">All Statuses</option>
						<option value="preparing">Preparing</option>
						<option value="dispatched">Dispatched</option>
						<option value="resolved">Resolved</option>
					</select>
				</div>
			</div>

			<!-- Main list table -->
			<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
				<table class="w-full min-w-max table-auto text-left">
					<thead class="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
						<tr>
							<th class="px-6 py-4">Request ID</th>
							<th class="px-6 py-4">Requester (Admin)</th>
							<th class="px-6 py-4">Event Purpose</th>
							<th class="px-6 py-4">Requested Assets</th>
							<th class="px-6 py-4">Priority / Confidentiality</th>
							<th class="px-6 py-4">Status</th>
							<th class="px-6 py-4 text-right">Workflow Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 text-sm text-gray-700">
						{#if displayConfidentialRequests.length === 0}
							<tr>
								<td colspan="7" class="py-12 text-center text-gray-400">
									<Lock size={32} class="mx-auto mb-2 text-gray-300" />
									<p class="text-sm font-medium">No confidential requests found.</p>
								</td>
							</tr>
						{:else}
							{#each displayConfidentialRequests as req}
								<tr class="transition-colors hover:bg-gray-50/50">
									<td class="px-6 py-4 font-mono text-xs font-bold text-gray-900">{req.id}</td>
									<td class="px-6 py-4">
										<p class="font-medium text-gray-900">{req.requesterName}</p>
										<p class="text-xs text-gray-400">Staff Account</p>
									</td>
									<td class="px-6 py-4">
										<div class="max-w-xs">
											<p class="line-clamp-1 font-medium text-gray-900">{req.purpose}</p>
											<p class="mt-0.5 text-xs text-gray-400">
												Due: {new Date(req.returnDate).toLocaleDateString()}
											</p>
										</div>
									</td>
									<td class="px-6 py-4">
										<div class="space-y-1">
											{#each req.items as item}
												<p class="text-xs">
													<span class="font-bold text-pink-600">{item.quantity}x</span>
													{item.name}
												</p>
											{/each}
										</div>
									</td>
									<td class="px-6 py-4">
										<div class="flex flex-col items-start gap-1">
											<span
												class="rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase
												{req.priority === 'Critical'
													? 'bg-red-100 text-red-700'
													: req.priority === 'High'
														? 'bg-orange-100 text-orange-700'
														: req.priority === 'Medium'
															? 'bg-blue-100 text-blue-700'
															: 'bg-gray-100 text-gray-700'}"
											>
												{req.priority} Priority
											</span>
											<span class="inline-flex items-center gap-1 text-xs text-gray-500">
												<Lock size={10} />
												{req.confidentialityLevel}
											</span>
										</div>
									</td>
									<td class="px-6 py-4">
										{#if req.status === 'preparing'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
											>
												Preparing
											</span>
										{:else if req.status === 'prepared'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700"
											>
												Ready to Release
											</span>
										{:else if req.status === 'dispatched'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
											>
												Dispatched
											</span>
										{:else}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
											>
												Resolved
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 text-right">
										<div class="flex justify-end gap-1.5">
											{#if req.status === 'preparing'}
												<button
													type="button"
													onclick={() => transitionConfidential(req, 'prepared')}
													class="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
												>
													Ready
												</button>
											{:else if req.status === 'prepared'}
												<button
													type="button"
													onclick={() => transitionConfidential(req, 'dispatched')}
													class="cursor-pointer rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-pink-700"
												>
													Release
												</button>
											{:else if req.status === 'dispatched'}
												<button
													type="button"
													onclick={() => transitionConfidential(req, 'resolved')}
													class="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
												>
													Confirm Return
												</button>
											{:else}
												<span class="text-xs text-gray-400 italic">Complete</span>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- ─── MODAL: WALK-IN BORROW FORM ──────────────────────────────────────── -->
{#if showWalkInModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
		<div
			class="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-100 pb-4">
				<div class="flex items-center gap-2">
					<Sparkles class="text-pink-600" size={20} />
					<h2 class="text-lg font-bold text-gray-900">New Walk-in Checkout Workflow</h2>
				</div>
				<button onclick={closeWalkInModal} class="text-gray-400 hover:text-gray-500">
					<X size={20} />
				</button>
			</div>

			<!-- Form Content -->
			<div class="mt-6 space-y-6">
				<!-- Step 1: Student Lookup -->
				<div>
					<span class="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
						>Borrower Profile</span
					>

					<div class="mb-3 flex items-center gap-4">
						<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
							<input
								type="radio"
								checked={!isCustomBorrower}
								onclick={() => (isCustomBorrower = false)}
								class="text-pink-600 focus:ring-pink-500"
							/>
							Search Database Student
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
							<input
								type="radio"
								checked={isCustomBorrower}
								onclick={() => (isCustomBorrower = true)}
								class="text-pink-600 focus:ring-pink-500"
							/>
							Custom Guest Borrower
						</label>
					</div>

					{#if !isCustomBorrower}
						<div class="relative">
							<input
								type="text"
								placeholder="Search student by name, email or ID..."
								bind:value={studentSearchVal}
								onfocus={() => (showStudentDropdown = true)}
								class="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
							/>
							{#if showStudentDropdown && filteredStudents.length > 0}
								<div
									class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
								>
									{#each filteredStudents as student}
										<button
											type="button"
											onclick={() => handleStudentSelect(student)}
											class="flex w-full items-start px-4 py-2 text-left text-sm hover:bg-pink-50 hover:text-pink-600"
										>
											<div>
												<p class="font-semibold">{student.firstName} {student.lastName}</p>
												<p class="text-xs text-gray-400">{student.email} · ID: {student.id}</p>
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div>
								<span class="mb-1 block text-xs text-gray-500">Full Name</span>
								<input
									type="text"
									bind:value={customStudentName}
									class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
									placeholder="Juan Dela Cruz"
								/>
							</div>
							<div>
								<span class="mb-1 block text-xs text-gray-500">Student ID #</span>
								<input
									type="text"
									bind:value={customStudentID}
									class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
									placeholder="2024-10023"
								/>
							</div>
							<div>
								<span class="mb-1 block text-xs text-gray-500">Email Address</span>
								<input
									type="email"
									bind:value={customStudentEmail}
									class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
									placeholder="juan@school.edu"
								/>
							</div>
						</div>
					{/if}
				</div>

				<!-- Step 2: Context Details -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div>
						<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Class / Subject Code</span
						>
						<select
							bind:value={selectedClassCode}
							class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
						>
							<option value="">Select Enrolled Class</option>
							{#each classCodesList as cc}
								<option value={cc.code}>{cc.code} - {cc.courseName} ({cc.section})</option>
							{/each}
						</select>
					</div>

					<div>
						<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Usage Location</span
						>
						<select
							bind:value={usageLocation}
							class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
						>
							<option value="school">Inside School / Lab</option>
							<option value="outdoor">Outdoor / Home Use</option>
						</select>
					</div>

					<div>
						<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Return Date Deadline</span
						>
						<input
							type="date"
							bind:value={returnDate}
							class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
						>Activity Purpose</span
					>
					<textarea
						bind:value={purpose}
						rows="2"
						placeholder="E.g., Baking activity for HM-302 Class"
						class="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					></textarea>
				</div>

				<!-- Step 3: Catalog & Cart Selection -->
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Catalog list search -->
					<div class="border-gray-150 rounded-xl border p-4">
						<span class="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Inventory Stock Lookup</span
						>
						<div class="relative mb-3">
							<span
								class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"
							>
								<Search size={14} />
							</span>
							<input
								type="text"
								bind:value={itemSearchQuery}
								placeholder="Search equipment..."
								class="w-full rounded-lg border border-gray-200 bg-white py-1.5 pr-3 pl-8 text-xs text-gray-900 focus:border-pink-500 focus:outline-none"
							/>
						</div>

						<div class="max-h-56 space-y-1 divide-y divide-gray-100 overflow-y-auto">
							{#each filteredInventory as item}
								<div class="flex items-center justify-between py-2 text-xs">
									<div>
										<p class="font-semibold text-gray-900">{item.name}</p>
										<p class="text-[10px] text-gray-400">
											{item.category} · Stock: {item.quantity + (item.donations ?? 0)}
										</p>
									</div>
									<button
										type="button"
										onclick={() => addToWalkInCart(item)}
										class="cursor-pointer rounded bg-pink-50 px-2 py-1 font-semibold text-pink-700 transition-colors hover:bg-pink-100"
									>
										Add
									</button>
								</div>
							{/each}
						</div>
					</div>

					<!-- Borrow Cart list -->
					<div
						class="border-gray-150 flex flex-col justify-between rounded-xl border bg-gray-50/50 p-4"
					>
						<div>
							<span class="mb-3 block text-xs font-bold tracking-wider text-gray-400 uppercase"
								>Selected Borrow Basket</span
							>
							{#if walkInCart.length === 0}
								<div class="py-12 text-center text-xs text-gray-400">
									<Package size={20} class="mx-auto mb-2 text-gray-300" />
									No items selected yet.
								</div>
							{:else}
								<div class="max-h-56 space-y-2 overflow-y-auto">
									{#each walkInCart as cartItem}
										<div
											class="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2 text-xs"
										>
											<div class="min-w-0 flex-1">
												<p class="truncate font-semibold text-gray-900">{cartItem.name}</p>
												<p class="text-[10px] text-gray-400">Available: {cartItem.quantity}</p>
											</div>
											<div class="flex items-center gap-3">
												<div class="flex items-center rounded border border-gray-200">
													<button
														type="button"
														disabled={cartItem.selectedQty <= 1}
														onclick={() => (cartItem.selectedQty -= 1)}
														class="px-1.5 py-0.5 hover:bg-gray-100 disabled:opacity-50"
													>
														-
													</button>
													<span class="px-2 font-semibold">{cartItem.selectedQty}</span>
													<button
														type="button"
														disabled={cartItem.selectedQty >= cartItem.quantity}
														onclick={() => (cartItem.selectedQty += 1)}
														class="px-1.5 py-0.5 hover:bg-gray-100 disabled:opacity-50"
													>
														+
													</button>
												</div>
												<button
													onclick={() => removeFromWalkInCart(cartItem.id)}
													class="text-red-500 hover:text-red-700"
												>
													<Trash2 size={14} />
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Footer Buttons -->
			<div class="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
				<button
					type="button"
					onclick={() => closeWalkInModal()}
					class="cursor-pointer rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={submitWalkInCheckout}
					class="cursor-pointer rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
				>
					Confirm & Issue Immediately
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ─── MODAL: WALK-IN RETURN / INSPECTION FORM ─────────────────────────── -->
{#if showReturnModal && selectedWalkIn}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
		<div
			class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
		>
			<div class="flex items-center justify-between border-b border-gray-100 pb-4">
				<div class="flex items-center gap-2">
					<RotateCcw class="text-pink-600" size={20} />
					<h2 class="text-lg font-bold text-gray-900">Return Inspection Desk</h2>
				</div>
				<button
					onclick={() => {
						showReturnModal = false;
						selectedWalkIn = null;
					}}
					class="text-gray-400 hover:text-gray-500"
				>
					<X size={20} />
				</button>
			</div>

			<div class="mt-6 space-y-4">
				<div class="rounded-lg bg-gray-50 p-3 text-xs">
					<p class="font-bold text-gray-700">Transaction ID: {selectedWalkIn.id}</p>
					<p class="mt-1 text-gray-600">
						Borrower: {selectedWalkIn.studentName} · ID: {selectedWalkIn.studentId}
					</p>
					<p class="text-gray-500">
						Class: {selectedWalkIn.classCode} · Checked out: {new Date(
							selectedWalkIn.borrowDate
						).toLocaleDateString()}
					</p>
				</div>

				<div class="space-y-3">
					<span class="block text-xs font-bold tracking-wider text-gray-400 uppercase"
						>Items Return Inspection Checklist</span
					>
					{#each selectedWalkIn.items as item}
						<div class="border-gray-150 space-y-3 rounded-xl border bg-white p-4">
							<div class="flex items-center justify-between">
								<p class="text-sm font-semibold text-gray-900">{item.name}</p>
								<span class="rounded bg-pink-100 px-2.5 py-0.5 text-xs font-bold text-pink-700"
									>{item.quantity} borrowed</span
								>
							</div>

							<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<!-- Selection status -->
								<div>
									<span class="mb-1 block text-xs text-gray-500">Return Status</span>
									<select
										bind:value={returnInspection[item.itemId].status}
										class="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-pink-500 focus:outline-none"
									>
										<option value="good">Returned Good / Clean</option>
										<option value="damaged">Returned Damaged</option>
										<option value="missing">Not Returned (Missing)</option>
									</select>
								</div>

								<!-- Notes -->
								<div>
									<span class="mb-1 block text-xs text-gray-500">Inspection Notes</span>
									<input
										type="text"
										bind:value={returnInspection[item.itemId].notes}
										placeholder="e.g. Scratched handle, no box, clean"
										class="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-pink-500 focus:outline-none"
									/>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
				<button
					type="button"
					onclick={() => {
						showReturnModal = false;
						selectedWalkIn = null;
					}}
					class="cursor-pointer rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={submitReturn}
					class="cursor-pointer rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
				>
					Record Return & Restock
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ─── MODAL: CONFIDENTIAL REQUEST FORM ────────────────────────────────── -->
{#if showConfidentialModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
		<div
			class="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
		>
			<div class="flex items-center justify-between border-b border-gray-100 pb-4">
				<div class="flex items-center gap-2">
					<Lock class="text-indigo-600" size={20} />
					<h2 class="text-lg font-bold text-gray-900">Secure Admin Request Form</h2>
				</div>
				<button onclick={closeConfidentialModal} class="text-gray-400 hover:text-gray-500">
					<X size={20} />
				</button>
			</div>

			<div class="mt-6 space-y-6">
				<!-- Step 1: Admin Selector -->
				<div>
					<span class="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
						>Requester Profile</span
					>
					<div class="mb-3 flex items-center gap-4">
						<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
							<input
								type="radio"
								checked={!isCustomAdmin}
								onclick={() => (isCustomAdmin = false)}
								class="text-pink-600 focus:ring-pink-500"
							/>
							Search Admin / Faculty
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
							<input
								type="radio"
								checked={isCustomAdmin}
								onclick={() => (isCustomAdmin = true)}
								class="text-pink-600 focus:ring-pink-500"
							/>
							Custom Staff Requester
						</label>
					</div>

					{#if !isCustomAdmin}
						<div class="relative">
							<input
								type="text"
								placeholder="Search administrator name..."
								bind:value={adminSearchVal}
								onfocus={() => (showAdminDropdown = true)}
								class="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
							/>
							{#if showAdminDropdown && filteredAdmins.length > 0}
								<div
									class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
								>
									{#each filteredAdmins as admin}
										<button
											type="button"
											onclick={() => handleAdminSelect(admin)}
											class="flex w-full items-start px-4 py-2 text-left text-sm hover:bg-indigo-50 hover:text-indigo-600"
										>
											<div>
												<p class="font-semibold">{admin.firstName} {admin.lastName}</p>
												<p class="text-xs text-gray-400">
													{admin.email} · Role: {admin.role.toUpperCase()}
												</p>
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div>
							<span class="mb-1 block text-xs text-gray-500">Requester Full Name</span>
							<input
								type="text"
								bind:value={customAdminName}
								class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
								placeholder="e.g. Dean Reyes"
							/>
						</div>
					{/if}
				</div>

				<!-- Step 2: Context Details -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div>
						<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Priority Level</span
						>
						<select
							bind:value={requestPriority}
							class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
						>
							<option value="Low">Low Priority</option>
							<option value="Medium">Medium Priority</option>
							<option value="High">High Priority</option>
							<option value="Critical">Critical Priority</option>
						</select>
					</div>

					<div>
						<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Confidentiality Classification</span
						>
						<select
							bind:value={confidentialityLevel}
							class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
						>
							<option value="Confidential">Confidential</option>
							<option value="Strictly Confidential">Strictly Confidential (VIP / Audits)</option>
						</select>
					</div>

					<div>
						<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Expected Return Deadline</span
						>
						<input
							type="date"
							bind:value={confidentialReturnDate}
							class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<span class="mb-1 block text-xs font-bold tracking-wider text-gray-400 uppercase"
						>Activity Purpose (Secure Log)</span
					>
					<textarea
						bind:value={confidentialPurpose}
						rows="2"
						placeholder="E.g., High-level executive audit review or VIP board presentation preparation."
						class="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					></textarea>
				</div>

				<!-- Step 3: Catalog & Cart Selection -->
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Catalog list search -->
					<div class="border-gray-150 rounded-xl border p-4">
						<span class="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
							>Inventory Stock Lookup</span
						>
						<div class="relative mb-3">
							<span
								class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"
							>
								<Search size={14} />
							</span>
							<input
								type="text"
								bind:value={itemSearchQuery}
								placeholder="Search equipment..."
								class="w-full rounded-lg border border-gray-200 bg-white py-1.5 pr-3 pl-8 text-xs text-gray-900 focus:border-pink-500 focus:outline-none"
							/>
						</div>

						<div class="max-h-56 space-y-1 divide-y divide-gray-100 overflow-y-auto">
							{#each filteredInventory as item}
								<div class="flex items-center justify-between py-2 text-xs">
									<div>
										<p class="font-semibold text-gray-900">{item.name}</p>
										<p class="text-[10px] text-gray-400">
											{item.category} · Stock: {item.quantity + (item.donations ?? 0)}
										</p>
									</div>
									<button
										type="button"
										onclick={() => addToConfidentialCart(item)}
										class="cursor-pointer rounded bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
									>
										Add
									</button>
								</div>
							{/each}
						</div>
					</div>

					<!-- Cart list -->
					<div
						class="border-gray-150 flex flex-col justify-between rounded-xl border bg-gray-50/50 p-4"
					>
						<div>
							<span class="mb-3 block text-xs font-bold tracking-wider text-gray-400 uppercase"
								>Request Assets Basket</span
							>
							{#if confidentialCart.length === 0}
								<div class="py-12 text-center text-xs text-gray-400">
									<Package size={20} class="mx-auto mb-2 text-gray-300" />
									No items selected yet.
								</div>
							{:else}
								<div class="max-h-56 space-y-2 overflow-y-auto">
									{#each confidentialCart as cartItem}
										<div
											class="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2 text-xs"
										>
											<div class="min-w-0 flex-1">
												<p class="truncate font-semibold text-gray-900">{cartItem.name}</p>
												<p class="text-[10px] text-gray-400">Available: {cartItem.quantity}</p>
											</div>
											<div class="flex items-center gap-3">
												<div class="flex items-center rounded border border-gray-200">
													<button
														type="button"
														disabled={cartItem.selectedQty <= 1}
														onclick={() => (cartItem.selectedQty -= 1)}
														class="px-1.5 py-0.5 hover:bg-gray-100 disabled:opacity-50"
													>
														-
													</button>
													<span class="px-2 font-semibold">{cartItem.selectedQty}</span>
													<button
														type="button"
														disabled={cartItem.selectedQty >= cartItem.quantity}
														onclick={() => (cartItem.selectedQty += 1)}
														class="px-1.5 py-0.5 hover:bg-gray-100 disabled:opacity-50"
													>
														+
													</button>
												</div>
												<button
													onclick={() => removeFromConfidentialCart(cartItem.id)}
													class="text-red-500 hover:text-red-700"
												>
													<Trash2 size={14} />
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Footer Buttons -->
			<div class="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
				<button
					type="button"
					onclick={closeConfidentialModal}
					class="cursor-pointer rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={submitConfidentialRequest}
					class="cursor-pointer rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
				>
					Create Request Pipeline
				</button>
			</div>
		</div>
	</div>
{/if}
