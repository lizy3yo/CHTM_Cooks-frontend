<script lang="ts">
	import { onMount } from 'svelte';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { inventoryItemsAPI, inventoryCategoriesAPI, type InventoryItem, type InventoryCategory } from '$lib/api/inventory';
	import { classCodesAPI, type ClassCodeResponse } from '$lib/api/classCodes';
	import { getBorrowSettings } from '$lib/api/borrowSettings';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { donationsAPI, type DonationResponse, type CreateDonationRequest } from '$lib/api/donations';
	import { walkInTransactionsAPI, type WalkInTransactionRecord } from '$lib/api/walkInTransactions';
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
		Info,
		Heart,
		Upload,
		Download
	} from 'lucide-svelte';

	// ─── TYPES FOR STATE MANAGEMENT ──────────────────────────────────────────
	interface WalkInItem {
		id: string;
		name: string;
		category: string;
		quantity: number;
		selectedQty: number;
	}

	// Walk-in transactions are persisted server-side (see walkInTransactionsAPI).
	type WalkInTransaction = WalkInTransactionRecord;

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
	let activeTab = $state<'walk-in' | 'confidential' | 'donations'>('walk-in');
	let loading = $state(true);

	// Collections loaded from APIs
	let studentsList = $state<UserResponse[]>([]);
	let adminList = $state<UserResponse[]>([]);
	let inventoryItems = $state<InventoryItem[]>([]);
	let classCodesList = $state<ClassCodeResponse[]>([]);

	// Alternative Transactions stored in localStorage / API
	let walkIns = $state<WalkInTransaction[]>([]);
	let confidentialRequests = $state<ConfidentialRequest[]>([]);
	let donations = $state<DonationResponse[]>([]);

	// Filters
	let walkInSearchQuery = $state('');
	let walkInStatusFilter = $state<'all' | 'borrowed' | 'returned' | 'missing'>('all');
	let walkInPersonFilter = $state<string>(''); // '' = all people, otherwise a studentId
	let confidentialSearchQuery = $state('');
	let confidentialStatusFilter = $state<'all' | 'preparing' | 'dispatched' | 'resolved'>('all');
	let donationSearchQuery = $state('');

	// Modals toggles
	let showWalkInModal = $state(false);
	let showReturnModal = $state(false);
	let showConfidentialModal = $state(false);
	let showDonationModal = $state(false);
	let donationsLoading = $state(false);
	let donationsLoaded = $state(false);

	// --- Item Donation Form State ---
	let donationAction = $state<'new_item' | 'add_to_existing'>('new_item');
	let donorName = $state('');
	let donationQuantity = $state(1);
	let donationUnit = $state('');
	let donationPurpose = $state('');
	let donationDate = $state(new Date().toISOString().split('T')[0]);
	let donationNotes = $state('');

	// Existing item selection for donation
	let selectedDonationItem = $state<InventoryItem | null>(null);
	let donationItemSearchQuery = $state('');
	let showDonationItemDropdown = $state(false);

	// New item creation for donation
	let newItemName = $state('');
	let newItemCategory = $state('');
	let newItemSpecification = $state('');
	let newItemToolsEquipment = $state('');
	let newItemPicture = $state('');
	let uploadingDonationImage = $state(false);
	let categoriesList = $state<InventoryCategory[]>([]);

	function handleDonationImageUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadingDonationImage = true;
		try {
			const reader = new FileReader();
			reader.onload = (evt) => {
				newItemPicture = evt.target?.result as string;
				uploadingDonationImage = false;
				toastStore.success('Image loaded for item donation preview!');
			};
			reader.readAsDataURL(file);
		} catch (err) {
			console.error('Failed to read image file:', err);
			toastStore.error('Failed to load image file.');
			uploadingDonationImage = false;
		}
	}

	let isSubmittingDonation = $state(false);

	async function fetchDonations() {
		if (donationsLoaded) return;
		donationsLoading = true;
		try {
			const res = await donationsAPI.getAll({ limit: 500 });
			donations = res.donations || [];
			donationsLoaded = true;
		} catch (err) {
			console.error('Failed to load donations:', err);
			toastStore.error('Failed to load donation records.');
		} finally {
			donationsLoading = false;
		}
	}

	async function handleCreateDonation() {
		if (!donorName.trim()) {
			toastStore.error('Please enter donor name or organization.');
			return;
		}
		if (donationQuantity <= 0) {
			toastStore.error('Please enter a valid quantity.');
			return;
		}

		isSubmittingDonation = true;
		try {
			let payload: CreateDonationRequest;
			if (donationAction === 'add_to_existing') {
				if (!selectedDonationItem) {
					toastStore.error('Please select an existing inventory item.');
					isSubmittingDonation = false;
					return;
				}
				payload = {
					inventoryAction: 'add_to_existing',
					donorName: donorName.trim(),
					quantity: donationQuantity,
					unit: donationUnit.trim() || undefined,
					purpose: donationPurpose.trim() || 'Item donation to CHTM laboratory',
					date: donationDate,
					notes: donationNotes.trim() || undefined,
					inventoryItemId: selectedDonationItem.id
				};
			} else {
				if (!newItemName.trim() || !newItemCategory.trim()) {
					toastStore.error('Please specify new item name and category.');
					isSubmittingDonation = false;
					return;
				}
				payload = {
					inventoryAction: 'new_item',
					itemName: newItemName.trim(),
					category: newItemCategory.trim(),
					specification: newItemSpecification.trim() || undefined,
					toolsOrEquipment: newItemToolsEquipment.trim() || undefined,
					picture: newItemPicture.trim() || undefined,
					donorName: donorName.trim(),
					quantity: donationQuantity,
					unit: donationUnit.trim() || undefined,
					purpose: donationPurpose.trim() || 'Item donation to CHTM laboratory',
					date: donationDate,
					notes: donationNotes.trim() || undefined
				};
			}

			await donationsAPI.create(payload);
			toastStore.success(`Donation from "${donorName}" recorded successfully!`);

			// Reset modal form
			showDonationModal = false;
			donorName = '';
			donationQuantity = 1;
			donationUnit = '';
			donationPurpose = '';
			donationNotes = '';
			selectedDonationItem = null;
			newItemName = '';
			newItemCategory = '';
			newItemSpecification = '';
			newItemToolsEquipment = '';
			newItemPicture = '';

			donationsLoaded = false;
			await fetchDonations();

			// Refresh inventory items
			const updatedItems = await inventoryItemsAPI.getAll({ includeArchived: false, forceRefresh: true });
			inventoryItems = updatedItems.items || [];
		} catch (err: any) {
			console.error(err);
			toastStore.error(err.message || 'Failed to record donation.');
		} finally {
			isSubmittingDonation = false;
		}
	}

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

	const todayDateStr = new Date().toLocaleDateString('en-CA');
	let maxAllowedDays = $state(30);

	function addDaysToDateStr(baseDateStr: string, days: number): string {
		const [year, month, day] = baseDateStr.split('-').map(Number);
		const d = new Date(year, month - 1, day);
		d.setDate(d.getDate() + days);
		return d.toLocaleDateString('en-CA');
	}

	const maxReturnDateStr = $derived(addDaysToDateStr(todayDateStr, maxAllowedDays));

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

	const filteredDonationInventory = $derived(
		inventoryItems.filter(
			(item) =>
				item.name.toLowerCase().includes(donationItemSearchQuery.toLowerCase()) &&
				!item.archived
		)
	);

	const filteredDonations = $derived.by(() => {
		let result = donations;
		if (donationSearchQuery.trim()) {
			const query = donationSearchQuery.toLowerCase().trim();
			result = result.filter(
				(d) =>
					d.donorName.toLowerCase().includes(query) ||
					d.itemName.toLowerCase().includes(query) ||
					(d.purpose && d.purpose.toLowerCase().includes(query)) ||
					(d.receiptNumber && d.receiptNumber.toLowerCase().includes(query))
			);
		}
		return result;
	});

	const donationStats = $derived.by(() => {
		const total = donations.length;
		const totalUnits = donations.reduce((sum, d) => sum + (d.quantity || 0), 0);
		const addedToExisting = donations.filter((d) => d.inventoryAction === 'add_to_existing').length;
		return { total, totalUnits, addedToExisting };
	});

	// Filtered lists
	const displayWalkIns = $derived(
		walkIns.filter((w) => {
			const matchesSearch =
				w.studentName.toLowerCase().includes(walkInSearchQuery.toLowerCase()) ||
				w.studentId.toLowerCase().includes(walkInSearchQuery.toLowerCase()) ||
				w.items.some((i) => i.name.toLowerCase().includes(walkInSearchQuery.toLowerCase()));
			const matchesStatus = walkInStatusFilter === 'all' || w.status === walkInStatusFilter;
			const matchesPerson = walkInPersonFilter === '' || w.studentId === walkInPersonFilter;
			return matchesSearch && matchesStatus && matchesPerson;
		})
	);

	// Unique people appearing in the walk-in transactions (for the Person filter).
	const walkInPeople = $derived.by(() => {
		const map = new Map<string, string>();
		for (const w of walkIns) if (w.studentId) map.set(w.studentId, w.studentName);
		return [...map.entries()]
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	// Export the currently-filtered walk-in transactions (respects person, status,
	// and search) to a CSV the custodian can open in Excel.
	function exportWalkIns() {
		const rows = displayWalkIns;
		if (rows.length === 0) {
			toastStore.error('No walk-in transactions match the current filters.');
			return;
		}
		const headers = [
			'Transaction ID', 'Student Name', 'Student ID', 'Email', 'Class Code',
			'Purpose', 'Usage Location', 'Borrow Date', 'Return Date', 'Status', 'Items', 'Notes'
		];
		const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const lines = [headers.map(esc).join(',')];
		for (const w of rows) {
			const items = w.items.map((i) => `${i.name} x${i.quantity}`).join('; ');
			lines.push(
				[w.id, w.studentName, w.studentId, w.email, w.classCode, w.purpose,
				 w.usageLocation, w.borrowDate, w.returnDate, w.status, items, w.notes ?? '']
					.map(esc)
					.join(',')
			);
		}
		const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const who = walkInPersonFilter
			? (walkInPeople.find((p) => p.id === walkInPersonFilter)?.name ?? 'person').replace(/\s+/g, '-')
			: 'all-people';
		const a = document.createElement('a');
		a.href = url;
		a.download = `walk-in-transactions-${who}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		toastStore.success(`Exported ${rows.length} walk-in transaction${rows.length === 1 ? '' : 's'}.`);
	}

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
			const [studentsRes, adminsRes, instructorsRes, inventoryRes, classesRes, categoriesRes] = await Promise.all([
				usersAPI.getAll({ role: 'student', limit: 100 }),
				usersAPI.getAll({ role: 'superadmin', limit: 50 }),
				usersAPI.getAll({ role: 'instructor', limit: 50 }),
				inventoryItemsAPI.getAll({ limit: 100 }),
				classCodesAPI.getAll({ limit: 50 }),
				inventoryCategoriesAPI.getAll({ includeArchived: false })
			]);

			studentsList = studentsRes.users || [];
			// Combine Superadmins and Instructors as administrators
			adminList = [...(adminsRes.users || []), ...(instructorsRes.users || [])];
			inventoryItems = inventoryRes.items || [];
			classCodesList = classesRes.classCodes || [];
			categoriesList = categoriesRes.categories || [];

			// Load walk-in transactions from the backend (shared across all staff).
			try {
				const walkInRes = await walkInTransactionsAPI.list({ limit: 500 });
				walkIns = walkInRes.walkIns || [];
			} catch (walkInErr) {
				console.error('Failed to load walk-in transactions:', walkInErr);
			}

			const savedConfidential = localStorage.getItem('chtm_confidential_requests');
			if (savedConfidential) {
				confidentialRequests = JSON.parse(savedConfidential);
			}

			try {
				const settings = await getBorrowSettings();
				maxAllowedDays = settings.allowExtendedBorrowing
					? settings.maxExtendedDays
					: settings.maxStandardDays;
			} catch (policyErr) {
				console.error('Failed to load borrowing policy settings:', policyErr);
			}
		} catch (error) {
			console.error('Failed to load transaction data sources', error);
			toastStore.error('Could not load some references. Fallbacks enabled.', 'Warning');
		} finally {
			loading = false;
		}
	});

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

		if (!selectedClassCode && !isCustomBorrower) {
			toastStore.error('Class Code selection is required for database students.');
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

		if (returnDate < todayDateStr) {
			toastStore.error('Return date cannot be in the past. Please select today or a future date.');
			return;
		}

		if (returnDate > maxReturnDateStr) {
			toastStore.error(
				`Return date exceeds maximum allowed borrowing duration of ${maxAllowedDays} days.`
			);
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

			// Persist the transaction to the backend (shared across all staff roles).
			const created = await walkInTransactionsAPI.create({
				studentName: name,
				studentId: sid,
				studentUserId: isCustomBorrower ? null : selectedStudent?.id,
				email: email,
				classCode: selectedClassCode || 'N/A (Guest)',
				purpose: purpose || 'Walk-in checkout',
				usageLocation,
				returnDate: new Date(returnDate).toISOString(),
				items: walkInCart.map((i) => ({
					itemId: i.id,
					name: i.name,
					quantity: i.selectedQty,
					category: i.category
				}))
			});

			walkIns = [created, ...walkIns];

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

			// Persist the return / inspection outcome to the backend.
			const updated = await walkInTransactionsAPI.markReturned(selectedWalkIn.id, {
				status: missingOrDamagedDetected ? 'missing' : 'returned',
				notes: Object.values(returnInspection)
					.map((v) => v.notes)
					.filter(Boolean)
					.join('; '),
				items: selectedWalkIn.items.map((i) => ({
					itemId: i.itemId,
					inspectionStatus: returnInspection[i.itemId]?.status ?? 'good'
				}))
			});

			walkIns = walkIns.map((w) => (w.id === updated.id ? updated : w));

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

		if (confidentialReturnDate < todayDateStr) {
			toastStore.error('Return deadline cannot be in the past.');
			return;
		}

		if (confidentialReturnDate > maxReturnDateStr) {
			toastStore.error(
				`Return deadline exceeds maximum allowed borrowing duration of ${maxAllowedDays} days.`
			);
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
			<h1 data-tour="custodian-transactions-header" class="text-2xl font-bold text-gray-900 sm:text-3xl">Alternative Transactions</h1>
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
			{:else if activeTab === 'confidential'}
				<button
					type="button"
					onclick={() => (showConfidentialModal = true)}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
				>
					<Lock size={15} /> Log Confidential Request
				</button>
			{:else}
				<button
					type="button"
					onclick={() => (showDonationModal = true)}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
				>
					<Heart size={15} class="fill-white text-white" /> Log Item Donation
				</button>
			{/if}
		</div>
	</div>

	<!-- ─── STATS CARDS ─────────────────────────────────────────────────────── -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3" data-tour="custodian-transactions-stats">
		<!-- Card 1: Total Walk-ins -->
		<button
			type="button"
			onclick={() => {
				activeTab = 'walk-in';
				walkInStatusFilter = 'all';
			}}
			class="group cursor-pointer rounded-xl border p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-pink-500 {activeTab === 'walk-in' && walkInStatusFilter === 'all'
				? 'border-pink-500 bg-pink-50/30 ring-2 ring-pink-500/20'
				: 'border-gray-100 bg-white hover:border-pink-200'}"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold tracking-wider text-gray-600 uppercase transition-colors group-hover:text-pink-600"
					>Total Walk-ins</span
				>
				<div class="rounded-lg bg-pink-50 p-2 text-pink-600 transition-colors group-hover:bg-pink-100">
					<Users size={16} />
				</div>
			</div>
			<div class="mt-4 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-gray-900">{walkInStats.total}</span>
				<span class="text-xs text-gray-600">records logged (click to filter all)</span>
			</div>
		</button>

		<!-- Card 2: Active Walk-in Borrows -->
		<button
			type="button"
			onclick={() => {
				activeTab = 'walk-in';
				walkInStatusFilter = 'borrowed';
			}}
			class="group cursor-pointer rounded-xl border p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500 {activeTab === 'walk-in' && walkInStatusFilter === 'borrowed'
				? 'border-amber-500 bg-amber-50/30 ring-2 ring-amber-500/20'
				: 'border-gray-100 bg-white hover:border-amber-200'}"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold tracking-wider text-gray-600 uppercase transition-colors group-hover:text-amber-600"
					>Active Walk-in Borrows</span
				>
				<div class="rounded-lg bg-amber-50 p-2 text-amber-600 transition-colors group-hover:bg-amber-100">
					<Clock size={16} />
				</div>
			</div>
			<div class="mt-4 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-amber-600">{walkInStats.active}</span>
				<span class="text-xs text-gray-600">out of lab (click to filter active)</span>
			</div>
		</button>

		<!-- Card 3: Confidential Admin Orders -->
		<button
			type="button"
			onclick={() => {
				activeTab = 'confidential';
			}}
			class="group cursor-pointer rounded-xl border p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'confidential'
				? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/20'
				: 'border-gray-100 bg-white hover:border-indigo-200'}"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold tracking-wider text-gray-600 uppercase transition-colors group-hover:text-indigo-600"
					>Confidential Admin Orders</span
				>
				<div class="rounded-lg bg-indigo-50 p-2 text-indigo-600 transition-colors group-hover:bg-indigo-100">
					<Lock size={15} />
				</div>
			</div>
			<div class="mt-4 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-indigo-700"
					>{confidentialStats.pending + confidentialStats.active}</span
				>
				<span class="text-xs text-gray-600">active pipelines (click to open tab)</span>
			</div>
		</button>
	</div>

	<!-- ─── TABS ────────────────────────────────────────────────────────────── -->
	<div class="border-b border-gray-200" data-tour="custodian-transactions-tabs">
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
			<button
				type="button"
				onclick={() => { activeTab = 'donations'; void fetchDonations(); }}
				class="cursor-pointer border-b-2 px-1 py-4 text-sm font-semibold transition-all {activeTab ===
				'donations'
					? 'border-red-600 text-red-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Item Donations ({donations.length})
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

				<!-- Person Filter + Status Filter + Export -->
				<div class="flex flex-wrap items-center gap-2">
					<select
						bind:value={walkInPersonFilter}
						aria-label="Filter by person"
						class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					>
						<option value="">All People</option>
						{#each walkInPeople as person}
							<option value={person.id}>{person.name}</option>
						{/each}
					</select>
					<select
						bind:value={walkInStatusFilter}
						aria-label="Filter by status"
						class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none"
					>
						<option value="all">All Transactions</option>
						<option value="borrowed">Borrowed (Out)</option>
						<option value="returned">Returned (Cleared)</option>
						<option value="missing">Issues (Missing/Damaged)</option>
					</select>
					<button
						type="button"
						onclick={exportWalkIns}
						class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
					>
						<Download size={15} />
						Export
					</button>
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
	{:else if activeTab === 'donations'}
		<!-- ─── TAB CONTENT: ITEM DONATIONS ────────────────────────────────────── -->
		<div class="space-y-4">
			<!-- Search Bar -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="relative max-w-md flex-1">
					<span
						class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"
					>
						<Search size={16} />
					</span>
					<input
						type="text"
						bind:value={donationSearchQuery}
						placeholder="Search donor name, item, or purpose..."
						class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
					/>
				</div>
			</div>

			<!-- Main List Table -->
			<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
				{#if donationsLoading}
					<div class="flex h-48 items-center justify-center">
						<div class="flex flex-col items-center gap-2">
							<div class="h-8 w-8 animate-spin rounded-full border-4 border-red-200 border-t-red-600"></div>
							<p class="text-xs font-medium text-gray-500">Loading item donations...</p>
						</div>
					</div>
				{:else if filteredDonations.length === 0}
					<div class="py-16 text-center">
						<Heart class="mx-auto h-12 w-12 text-red-500 fill-red-100" />
						<h3 class="mt-4 text-base font-semibold text-gray-900">No donation records found</h3>
						<p class="mt-1 text-sm text-gray-500">Log a new item donation using the button above.</p>
					</div>
				{:else}
					<table class="w-full min-w-max table-auto text-left text-sm text-gray-700">
						<thead class="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200">
							<tr>
								<th class="px-6 py-4">Receipt / Ref</th>
								<th class="px-6 py-4">Donor Name / Entity</th>
								<th class="px-6 py-4">Donated Item</th>
								<th class="px-6 py-4 text-center">Quantity</th>
								<th class="px-6 py-4">Inventory Action</th>
								<th class="px-6 py-4">Purpose / Notes</th>
								<th class="px-6 py-4 text-right pr-6">Date Received</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each filteredDonations as d}
								<tr class="transition-colors hover:bg-gray-50/50">
									<td class="px-6 py-4 font-mono text-xs font-bold text-red-600">
										{d.receiptNumber || `DON-${d.id.slice(0, 6).toUpperCase()}`}
									</td>
									<td class="px-6 py-4 font-semibold text-gray-900">
										{d.donorName}
									</td>
									<td class="px-6 py-4 font-medium text-gray-900">
										<div class="flex items-center gap-2">
											<Package size={15} class="text-gray-400" />
											{d.itemName}
										</div>
									</td>
									<td class="px-6 py-4 text-center font-bold text-gray-900 tabular-nums">
										+{d.quantity} {d.quantity === 1 ? 'unit' : 'units'}
									</td>
									<td class="px-6 py-4">
										{#if d.inventoryAction === 'add_to_existing'}
											<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
												+ Added to Existing Stock
											</span>
										{:else}
											<span class="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
												New Inventory Item
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
										{d.notes || d.purpose || 'Item donation'}
									</td>
									<td class="px-6 py-4 text-xs text-gray-500 whitespace-nowrap text-right pr-6">
										{new Date(d.date || d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- ─── MODAL: LOG ITEM DONATION ────────────────────────────────────────── -->
{#if showDonationModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
		<div class="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
			<!-- Modal Header -->
			<div class="flex items-center justify-between border-b border-gray-100 pb-4">
				<div class="flex items-center gap-2">
					<div class="rounded-lg bg-red-50 p-2 text-red-500">
						<Heart size={20} class="fill-red-500 text-red-500" />
					</div>
					<div>
						<h2 class="text-lg font-bold text-gray-900">Log Item Donation</h2>
						<p class="text-xs text-gray-500">Receive and register equipment donations to inventory</p>
					</div>
				</div>
				<button
					type="button"
					onclick={() => (showDonationModal = false)}
					class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
				>
					<X size={18} />
				</button>
			</div>

			<!-- Action Selector Tabs -->
			<div class="mt-4">
				<div class="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-100 p-1">
					<button
						type="button"
						onclick={() => (donationAction = 'new_item')}
						class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all {donationAction === 'new_item'
							? 'border border-gray-200/50 bg-white text-red-600 shadow-xs'
							: 'text-gray-500 hover:text-gray-700'}"
					>
						<Plus size={14} /> New Inventory Item
					</button>
					<button
						type="button"
						onclick={() => (donationAction = 'add_to_existing')}
						class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all {donationAction === 'add_to_existing'
							? 'border border-gray-200/50 bg-white text-red-600 shadow-xs'
							: 'text-gray-500 hover:text-gray-700'}"
					>
						<Package size={14} /> Add to Existing Item
					</button>
				</div>
				<p class="mt-1.5 text-[11px] text-gray-400">
					{#if donationAction === 'new_item'}
						Creates a new item in the inventory and records the donation.
					{:else}
						Adds quantity to an existing item in the inventory and records the donation.
					{/if}
				</p>
			</div>

			<!-- Modal Body Form -->
			<form onsubmit={(e) => { e.preventDefault(); handleCreateDonation(); }} class="mt-4 space-y-4 border-t border-gray-100 pt-4">
				<!-- Donor Name -->
				<div>
					<label for="donorName" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
						Donor Name *
					</label>
					<input
						id="donorName"
						type="text"
						required
						bind:value={donorName}
						placeholder="Individual or organization name"
						class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
					/>
				</div>

				{#if donationAction === 'new_item'}
					<!-- Item Name -->
					<div>
						<label for="newItemName" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Item Name *
						</label>
						<input
							id="newItemName"
							type="text"
							required
							bind:value={newItemName}
							placeholder="e.g. Cooking Pot, Ladle Set"
							class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
						/>
					</div>

					<!-- Category Select -->
					<div>
						<label for="newItemCategory" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Category *
						</label>
						<select
							id="newItemCategory"
							required
							bind:value={newItemCategory}
							class="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
						>
							<option value="">Select category</option>
							{#each categoriesList as cat}
								<option value={cat.name}>{cat.name}</option>
							{/each}
							<option value="Kitchen Equipment">Kitchen Equipment</option>
							<option value="Kitchen Appliances">Kitchen Appliances</option>
							<option value="Utensils">Utensils</option>
							<option value="Bakeware">Bakeware</option>
							<option value="Cookware">Cookware</option>
							<option value="Glassware">Glassware</option>
							<option value="Tableware">Tableware</option>
							<option value="General">General</option>
						</select>
					</div>

					<!-- Specification & Tools/Equipment -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="newItemSpecification" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
								Specification <span class="text-gray-400 font-normal text-[11px]">(optional)</span>
							</label>
							<input
								id="newItemSpecification"
								type="text"
								bind:value={newItemSpecification}
								placeholder="e.g. Stainless steel, 5L"
								class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
							/>
						</div>
						<div>
							<label for="newItemToolsEquipment" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
								Tools / Equipment <span class="text-gray-400 font-normal text-[11px]">(optional)</span>
							</label>
							<input
								id="newItemToolsEquipment"
								type="text"
								bind:value={newItemToolsEquipment}
								placeholder="e.g. Kitchen Equipment"
								class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
							/>
						</div>
					</div>

					<!-- Item Image File Upload -->
					<div>
						<label for="donationImageFile" class="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
							Item Image / Photo <span class="text-gray-400 font-normal text-[11px]">(optional)</span>
						</label>
						{#if newItemPicture}
							<div class="relative flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3">
								<div class="flex items-center gap-3">
									<img src={newItemPicture} alt="Donated item preview" class="h-12 w-12 rounded-lg object-cover border border-gray-200" />
									<div>
										<p class="text-xs font-semibold text-gray-900">Photo attached</p>
										<p class="text-[11px] text-gray-500">Ready to save with item donation</p>
									</div>
								</div>
								<button
									type="button"
									onclick={() => (newItemPicture = '')}
									class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
								>
									Remove Photo
								</button>
							</div>
						{:else}
							<label class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-4 text-center transition-colors hover:bg-red-50/20 hover:border-red-400">
								<Upload size={22} class="text-gray-400 mb-1" />
								<span class="text-xs font-semibold text-gray-700">Click to upload photo</span>
								<span class="text-[11px] text-gray-400 mt-0.5">PNG, JPG, WEBP up to 5MB</span>
								<input id="donationImageFile" type="file" accept="image/*" class="hidden" onchange={handleDonationImageUpload} />
							</label>
						{/if}
					</div>
				{:else}
					<!-- Select Existing Inventory Item -->
					<div class="relative">
						<label for="existingItemSelect" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Select Inventory Item *
						</label>
						{#if selectedDonationItem}
							<div class="mt-1 flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 p-3">
								<div class="flex items-center gap-2">
									<Package size={16} class="text-red-600" />
									<div>
										<p class="text-sm font-bold text-gray-900">{selectedDonationItem.name}</p>
										<p class="text-xs text-gray-500">Current Stock: {selectedDonationItem.quantity}</p>
									</div>
								</div>
								<button
									type="button"
									onclick={() => (selectedDonationItem = null)}
									class="text-xs font-semibold text-red-600 hover:underline"
								>
									Change
								</button>
							</div>
						{:else}
							<input
								id="existingItemSelect"
								type="text"
								bind:value={donationItemSearchQuery}
								onfocus={() => (showDonationItemDropdown = true)}
								placeholder="Search equipment item name..."
								class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
							/>
							{#if showDonationItemDropdown && filteredDonationInventory.length > 0}
								<div class="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
									{#each filteredDonationInventory.slice(0, 10) as item}
										<button
											type="button"
											onclick={() => {
												selectedDonationItem = item;
												showDonationItemDropdown = false;
											}}
											class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-red-50/50"
										>
											<span class="font-semibold text-gray-900">{item.name}</span>
											<span class="text-xs text-gray-500">Stock: {item.quantity}</span>
										</button>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Quantity & Unit -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="donationQuantity" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Quantity *
						</label>
						<input
							id="donationQuantity"
							type="number"
							min="1"
							required
							bind:value={donationQuantity}
							class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
						/>
					</div>
					<div>
						<label for="donationUnit" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Unit <span class="text-gray-400 font-normal text-[11px]">(optional)</span>
						</label>
						<input
							id="donationUnit"
							type="text"
							bind:value={donationUnit}
							placeholder="pcs, kg, sets"
							class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
						/>
					</div>
				</div>

				<!-- Purpose & Date Received -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="donationPurpose" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Purpose *
						</label>
						<input
							id="donationPurpose"
							type="text"
							required
							bind:value={donationPurpose}
							placeholder="Intended use of the donated item"
							class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
						/>
					</div>
					<div>
						<label for="donationDate" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
							Date Received *
						</label>
						<input
							id="donationDate"
							type="date"
							required
							bind:value={donationDate}
							class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
						/>
					</div>
				</div>

				<!-- Notes (optional) -->
				<div>
					<label for="donationNotes" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
						Notes <span class="text-gray-400 font-normal text-[11px]">(optional)</span>
					</label>
					<input
						id="donationNotes"
						type="text"
						bind:value={donationNotes}
						placeholder="Additional notes"
						class="mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
					/>
				</div>

				<!-- Modal Footer -->
				<div class="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
					<button
						type="button"
						onclick={() => (showDonationModal = false)}
						class="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
						disabled={isSubmittingDonation}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-red-700"
						disabled={isSubmittingDonation}
					>
						{#if isSubmittingDonation}
							Logging...
						{:else}
							Log Donation
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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
				<div class="grid grid-cols-1 gap-4 {isCustomBorrower ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}">
					{#if !isCustomBorrower}
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
					{/if}

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
							min={todayDateStr}
							max={maxReturnDateStr}
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
							min={todayDateStr}
							max={maxReturnDateStr}
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
