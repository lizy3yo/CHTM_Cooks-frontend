<script lang="ts">
	import SpreadsheetImportModal, { type ImportColumn } from '$lib/components/ui/SpreadsheetImportModal.svelte';
	import { importsAPI, type UserImportRow } from '$lib/api/imports';
	import { onMount } from 'svelte';
	import {
		Search,
		Plus,
		Upload,
		Download,
		Info,
		Edit,
		Trash2,
		Users,
		UserCheck,
		UserX,
		UserRound,
		UserPlus,
		MoreVertical,
		X,
		RefreshCw,
		Eye,
		KeyRound,
		Wifi,
		WifiOff
	} from 'lucide-svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import ActionMenu from '$lib/components/ui/ActionMenu.svelte';
	import {
		usersAPI,
		type UserResponse,
		type UserRole,
		type ProfilePhotoUpdatedEvent
	} from '$lib/api/users';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';

	type Tab = 'all' | 'inactive';

	// ─── Tab & UI state ─────────────────────────────────────────────────────────
	let activeTab = $state<Tab>('all');
	let sseConnected = $state(false);

	// ─── Modal state ─────────────────────────────────────────────────────────────
	let showCreateModal = $state(false);

	// ─── Users list state ────────────────────────────────────────────────────────
	let users = $state<UserResponse[]>([]);
	let pagination = $state({ page: 1, limit: 20, total: 0, totalPages: 1 });
	let loading = $state(false);
	let searchQuery = $state('');
	let selectedRole = $state<UserRole | 'all'>('all');
	let selectedStatus = $state<'all' | 'active' | 'inactive' | 'new-this-month'>('all');
	let debounceTimer: ReturnType<typeof setTimeout>;

	// ─── Stats derived from full counts ─────────────────────────────────────────
	let stats = $state({
		total: 0,
		active: 0,
		inactive: 0,
		newThisMonth: 0,
		students: 0,
		instructors: 0,
		custodians: 0,
		admins: 0
	});

	// ─── Create user form ────────────────────────────────────────────────────────
	let createForm = $state({
		firstName: '',
		lastName: '',
		email: '',
		password: '',
		role: '' as UserRole | '',
		yearLevel: '',
		block: ''
	});
	let createLoading = $state(false);
	let createErrors = $state<Record<string, string>>({});

	// ─── Edit user modal ─────────────────────────────────────────────────────────
	let editUser = $state<UserResponse | null>(null);
	let editForm = $state({
		firstName: '',
		lastName: '',
		role: '' as UserRole,
		yearLevel: '',
		block: '',
		isActive: true
	});
	let editLoading = $state(false);

	// ─── Dropdown open tracking ──────────────────────────────────────────────────
	let openDropdown = $state<string | null>(null);

	// ─── Import students / instructors ───────────────────────────────────────────
	/** Which kind of account the open import dialog creates; null when closed. */
	let importRole = $state<'student' | 'instructor' | null>(null);
	/** Every imported account starts on this password; the superadmin chooses it. */
	let temporaryPassword = $state('');

	const NAME_COLUMNS: ImportColumn[] = [
		{ key: 'firstName', label: 'First Name', required: true, example: 'Juan', aliases: ['Given Name'] },
		{ key: 'lastName', label: 'Last Name', required: true, example: 'Dela Cruz', aliases: ['Surname', 'Family Name'] },
		{ key: 'email', label: 'Email', required: true, type: 'email', example: 'juan.delacruz@gordoncollege.edu.ph', aliases: ['Email Address'] }
	];
	const STUDENT_IMPORT_COLUMNS: ImportColumn[] = [
		...NAME_COLUMNS,
		{ key: 'yearLevel', label: 'Year Level', required: true, example: '2nd Year', aliases: ['Year'] },
		{ key: 'block', label: 'Block', required: true, example: 'A', aliases: ['Block Section'] },
		{ key: 'courseCode', label: 'Course Code', example: 'HM-201', aliases: ['Class'] },
		{ key: 'section', label: 'Section', example: 'BSHM 2A', aliases: ['Class Section'] }
	];

	// ─── SSE cleanup ─────────────────────────────────────────────────────────────
	let unsubscribeSSE: (() => void) | null = null;

	// ─── Per-user realtime photo overrides ──────────────────────────────────────
	// Keyed by userId; value is the fresh photoUrl received via SSE.
	// This lets us patch individual avatars in-place without re-fetching the
	// whole page — a pattern used by platforms like Twitter and LinkedIn.
	let photoOverrides = $state<Map<string, string | null>>(new Map());

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function hydrateFromCache(): boolean {
		const role = selectedRole !== 'all' ? selectedRole : undefined;
		const cached = usersAPI.peekCachedUsers({
			role,
			search: searchQuery || undefined,
			page: pagination.page,
			limit: pagination.limit
		});
		if (!cached) return false;

		let list = cached.users;
		if (selectedStatus === 'active') list = list.filter((u) => u.isActive);
		else if (selectedStatus === 'inactive') list = list.filter((u) => !u.isActive);
		else if (selectedStatus === 'new-this-month') {
			const now = new Date();
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			list = list.filter((u) => new Date(u.createdAt) >= monthStart);
		}
		users = list;
		pagination = cached.pagination;
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadUsers(false, forceRefresh);
			void loadStats(forceRefresh);
		}, 250);
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────────────
	onMount(() => {
		if (typeof window !== 'undefined') {
			const urlParams = new URLSearchParams(window.location.search);
			const roleParam = urlParams.get('role');
			const statusParam = urlParams.get('status');
			if (roleParam === 'student' || roleParam === 'instructor' || roleParam === 'custodian' || roleParam === 'superadmin' || roleParam === 'admin') {
				selectedRole = roleParam;
			}
			if (statusParam === 'active' || statusParam === 'inactive' || statusParam === 'new-this-month') {
				selectedStatus = statusParam as any;
			}
		}
		hydrateFromCache();
		void loadUsers(users.length === 0, false);
		void loadStats(false);

		unsubscribeSSE = usersAPI.subscribeToChanges(
			// ── CRUD events (create / update / delete) ─────────────────────────
			(event) => {
				sseConnected = true;
				scheduleRefresh(true);
				const msgs: Record<string, string> = {
					user_created: 'A new user was added',
					user_updated: 'A user was updated',
					user_deleted: 'A user was removed'
				};
				// Reconnects wake every subscriber and connections recycle constantly,
				// so only announce an actual change — never a defensive re-read.
				if (event?.reason === 'change') {
					toastStore.info(msgs[event.action] || 'User list updated', 'Live Update');
				}
			},
			// ── Profile photo events (in-place avatar patch) ────────────────────
			async (event: ProfilePhotoUpdatedEvent) => {
				await patchUserPhoto(event.userId);
			}
		);
		setTimeout(() => {
			sseConnected = true;
		}, 1500);

		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadUsers(false, true);
			void loadStats(true);
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => {
			void loadUsers(false, true);
			void loadStats(true);
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void loadUsers(false, true);
				void loadStats(true);
			}
		};
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

	// ─── Data loading ─────────────────────────────────────────────────────────────
	async function loadUsers(showLoader = true, forceRefresh = true) {
		if (showLoader && users.length === 0) loading = true;
		try {
			const role = selectedRole !== 'all' ? selectedRole : undefined;
			const res = await usersAPI.getAll({
				role,
				search: searchQuery || undefined,
				page: pagination.page,
				limit: pagination.limit,
				forceRefresh
			});
			let list = res.users;
			if (selectedStatus === 'active') list = list.filter((u) => u.isActive);
			else if (selectedStatus === 'inactive') list = list.filter((u) => !u.isActive);
			else if (selectedStatus === 'new-this-month') {
				const now = new Date();
				const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
				list = list.filter((u) => new Date(u.createdAt) >= monthStart);
			}
			users = list;
			pagination = res.pagination;
			// Clear stale photo overrides for users no longer in view
			const activeIds = new Set(list.map((u) => u.id));
			for (const id of photoOverrides.keys()) {
				if (!activeIds.has(id)) photoOverrides.delete(id);
			}
			photoOverrides = new Map(photoOverrides); // trigger reactivity
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load users');
		} finally {
			loading = false;
		}
	}

	/**
	 * Fetch the latest profilePhotoUrl for one user via API and store it in the
	 * override map, so the avatar refreshes in-place without a full table reload.
	 */
	async function patchUserPhoto(userId: string): Promise<void> {
		try {
			const freshUser = await usersAPI.getById(userId, true);
			photoOverrides = new Map(photoOverrides.set(userId, freshUser.profilePhotoUrl ?? null));
		} catch {
			// Silently fall back — the next full reload will catch up
		}
	}

	/**
	 * Returns the URL to display for a user's avatar.
	 * Priority: SSE-patched override → value from the paginated list → null
	 */
	function getAvatarUrl(u: UserResponse): string | null {
		if (photoOverrides.has(u.id)) return photoOverrides.get(u.id) ?? null;
		return u.profilePhotoUrl ?? null;
	}

	async function loadStats(forceRefresh = true) {
		try {
			const [all, students, instructors, custodians, admins] = await Promise.all([
				usersAPI.getAll({ limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'student', limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'instructor', limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'custodian', limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'admin', limit: 1, forceRefresh })
			]);
			const allRes = await usersAPI.getAll({ limit: 1000, forceRefresh });
			const now = new Date();
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			stats = {
				total: all.pagination.total,
				active: allRes.users.filter((u) => u.isActive).length,
				inactive: allRes.users.filter((u) => !u.isActive).length,
				newThisMonth: allRes.users.filter((u) => new Date(u.createdAt) >= monthStart).length,
				students: students.pagination.total,
				instructors: instructors.pagination.total,
				custodians: custodians.pagination.total,
				admins: admins.pagination.total
			};
		} catch {
			/* silent */
		}
	}

	// ─── Search debounce ─────────────────────────────────────────────────────────
	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			pagination.page = 1;
			loadUsers();
		}, 300);
	}

	function onFilterChange() {
		pagination.page = 1;
		loadUsers();
	}

	// ─── CRUD actions ─────────────────────────────────────────────────────────────
	function validateCreate(): boolean {
		const errs: Record<string, string> = {};
		if (!createForm.firstName.trim()) errs.firstName = 'Required';
		if (!createForm.lastName.trim()) errs.lastName = 'Required';
		if (!createForm.email.trim()) errs.email = 'Required';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) errs.email = 'Invalid email';
		if (!createForm.password) errs.password = 'Required';
		else if (createForm.password.length < 8) errs.password = 'Minimum 8 characters';
		if (!createForm.role) errs.role = 'Required';
		if (createForm.role === 'student' && !createForm.yearLevel)
			errs.yearLevel = 'Required for students';
		if (createForm.role === 'student' && !createForm.block) errs.block = 'Required for students';
		createErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function handleCreateUser() {
		if (!validateCreate()) return;
		createLoading = true;
		try {
			await usersAPI.create({
				firstName: createForm.firstName.trim(),
				lastName: createForm.lastName.trim(),
				email: createForm.email.trim().toLowerCase(),
				password: createForm.password,
				role: createForm.role as UserRole,
				yearLevel: createForm.role === 'student' ? createForm.yearLevel : undefined,
				block: createForm.role === 'student' ? createForm.block : undefined
			});
			toastStore.success(
				`${createForm.firstName} ${createForm.lastName} created successfully`,
				'User Created'
			);
			createForm = {
				firstName: '',
				lastName: '',
				email: '',
				password: '',
				role: '',
				yearLevel: '',
				block: ''
			};
			createErrors = {};
			showCreateModal = false;
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create user', 'Error');
		} finally {
			createLoading = false;
		}
	}

	function openEdit(user: UserResponse) {
		editUser = user;
		editForm = {
			firstName: user.firstName,
			lastName: user.lastName,
			role: user.role,
			yearLevel: user.yearLevel || '',
			block: user.block || '',
			isActive: user.isActive
		};
		openDropdown = null;
	}

	async function handleEditUser() {
		if (!editUser) return;
		editLoading = true;
		try {
			await usersAPI.update(editUser.id, {
				firstName: editForm.firstName.trim(),
				lastName: editForm.lastName.trim(),
				role: editForm.role,
				isActive: editForm.isActive,
				yearLevel: editForm.role === 'student' ? editForm.yearLevel : undefined,
				block: editForm.role === 'student' ? editForm.block : undefined
			});
			toastStore.success('User updated successfully', 'Saved');
			editUser = null;
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to update user', 'Error');
		} finally {
			editLoading = false;
		}
	}

	async function handleToggleActive(user: UserResponse) {
		openDropdown = null;
		const action = user.isActive ? 'deactivate' : 'reactivate';
		const confirmed = await confirmStore.confirm({
			type: user.isActive ? 'warning' : 'info',
			title: user.isActive ? 'Deactivate User' : 'Reactivate User',
			message: `Are you sure you want to ${action} ${user.firstName} ${user.lastName}? ${user.isActive ? 'They will lose access immediately.' : 'They will regain access to the system.'}`,
			confirmText: user.isActive ? 'Deactivate' : 'Reactivate'
		});
		if (!confirmed) return;
		try {
			await usersAPI.update(user.id, { isActive: !user.isActive });
			toastStore.success(
				`${user.firstName} ${user.isActive ? 'deactivated' : 'reactivated'} successfully`
			);
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || `Failed to ${action} user`);
		}
	}

	async function handleDelete(user: UserResponse) {
		openDropdown = null;
		const confirmed = await confirmStore.danger(
			`Are you sure you want to permanently remove ${user.firstName} ${user.lastName} (${user.email})? This action cannot be undone.`,
			'Remove User',
			'Remove Permanently'
		);
		if (!confirmed) return;
		try {
			await usersAPI.delete(user.id);
			toastStore.success(`${user.firstName} ${user.lastName} deleted`, 'User Deleted');
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to delete user');
		}
	}

	async function handleResetPassword(user: UserResponse) {
		openDropdown = null;
		const confirmed = await confirmStore.confirm({
			type: 'warning',
			title: 'Reset Password',
			message: `Send a password reset link to ${user.email}?`,
			confirmText: 'Send Reset Link'
		});
		if (!confirmed) return;
		toastStore.info(`Password reset link sent to ${user.email}`, 'Reset Sent');
	}

	// ─── Import students / instructors (Excel / CSV) ────────────────────────────
	async function importUserRows(rows: Record<string, string | number | undefined>[]): Promise<string> {
		const role = importRole!;
		const r = await importsAPI.users(role, rows as unknown as UserImportRow[], temporaryPassword);
		const noun = role === 'student' ? 'student' : 'instructor';
		return `${r.imported} ${noun} account${r.imported === 1 ? '' : 's'} created${r.enrolled ? `, ${r.enrolled} enrolled into a class` : ''}. They sign in with the temporary password you set.`;
	}

	async function refreshAfterImport(): Promise<void> {
		await loadUsers();
		await loadStats();
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────────
	function roleBadge(role: string) {
		const map: Record<string, string> = {
			student: 'bg-blue-100 text-blue-800 border border-blue-200',
			instructor: 'bg-violet-100 text-violet-800 border border-violet-200',
			custodian: 'bg-pink-100 text-pink-800 border border-pink-200',
			superadmin: 'bg-gray-900 text-white border border-gray-700',
			admin: 'bg-teal-100 text-teal-800 border border-teal-200'
		};
		return map[role] || 'bg-gray-100 text-gray-700';
	}

	function statusBadge(active: boolean) {
		return active
			? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
			: 'bg-gray-100 text-gray-500 border border-gray-200';
	}

	function avatar(u: UserResponse) {
		return `${u.firstName[0] || ''}${u.lastName[0] || ''}`.toUpperCase();
	}

	function avatarColor(role: string) {
		const map: Record<string, string> = {
			student: 'from-pink-500 to-rose-600',
			instructor: 'from-violet-500 to-violet-700',
			custodian: 'from-pink-500 to-rose-600',
			superadmin: 'from-gray-700 to-gray-900',
			admin: 'from-teal-500 to-teal-700'
		};
		return map[role] || 'from-pink-500 to-rose-600';
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-PH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function timeAgo(d: string | Date | undefined) {
		if (!d) return '—';
		const diff = Date.now() - new Date(d).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'Just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}

	const inputCls =
		'mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 transition';
	const errorCls = 'mt-1 text-xs text-red-600';
</script>

<!-- ─── Create User Modal ────────────────────────────────────────────────────── -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) showCreateModal = false;
		}}
		role="presentation"
	>
		<div
			class="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="create-user-modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
				<div>
					<h2 id="create-user-modal-title" class="text-xl font-semibold text-gray-900">Create New User</h2>
					<p class="mt-0.5 text-sm text-gray-500">Add a new user account with role-based permissions</p>
				</div>
				<button
					type="button"
					onclick={() => (showCreateModal = false)}
					class="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close create user dialog"
				>
					<X size={20} />
				</button>
			</div>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleCreateUser();
				}}
				class="p-6 space-y-4"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="create-first-name" class="block text-sm font-medium text-gray-700"
							>First Name <span class="text-red-500">*</span></label
						>
						<input
							id="create-first-name"
							type="text"
							bind:value={createForm.firstName}
							class={inputCls}
							placeholder="Juan"
						/>
						{#if createErrors.firstName}<p class={errorCls}>{createErrors.firstName}</p>{/if}
					</div>
					<div>
						<label for="create-last-name" class="block text-sm font-medium text-gray-700"
							>Last Name <span class="text-red-500">*</span></label
						>
						<input
							id="create-last-name"
							type="text"
							bind:value={createForm.lastName}
							class={inputCls}
							placeholder="dela Cruz"
						/>
						{#if createErrors.lastName}<p class={errorCls}>{createErrors.lastName}</p>{/if}
					</div>
				</div>
				<div>
					<label for="create-email" class="block text-sm font-medium text-gray-700"
						>Email Address <span class="text-red-500">*</span></label
					>
					<input
						id="create-email"
						type="email"
						bind:value={createForm.email}
						class={inputCls}
						placeholder="juan@example.com"
					/>
					{#if createErrors.email}<p class={errorCls}>{createErrors.email}</p>{/if}
				</div>
				<div>
					<label for="create-password" class="block text-sm font-medium text-gray-700"
						>Password <span class="text-red-500">*</span></label
					>
					<input
						id="create-password"
						type="password"
						bind:value={createForm.password}
						class={inputCls}
						placeholder="Min. 8 characters"
					/>
					{#if createErrors.password}<p class={errorCls}>{createErrors.password}</p>{/if}
				</div>
				<div>
					<label for="create-role" class="block text-sm font-medium text-gray-700"
						>Role <span class="text-red-500">*</span></label
					>
					<select id="create-role" bind:value={createForm.role} class={inputCls}>
						<option value="">Select a role…</option>
						<option value="student">Student</option>
						<option value="instructor">Instructor</option>
						<option value="custodian">Custodian</option>
						<option value="superadmin">Superadmin</option>
						<option value="admin">Admin</option>
					</select>
					{#if createErrors.role}<p class={errorCls}>{createErrors.role}</p>{/if}
				</div>

				{#if createForm.role === 'student'}
					<div class="space-y-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
						<p class="text-sm font-semibold text-blue-900">Student Details</p>
						<div class="grid gap-4 sm:grid-cols-2">
							<div>
								<label for="create-year-level" class="block text-sm font-medium text-blue-800"
									>Year Level <span class="text-red-500">*</span></label
								>
								<select id="create-year-level" bind:value={createForm.yearLevel} class={inputCls}>
									<option value="">Select year…</option>
									<option>1st Year</option><option>2nd Year</option><option>3rd Year</option
									><option>4th Year</option>
								</select>
								{#if createErrors.yearLevel}<p class={errorCls}>{createErrors.yearLevel}</p>{/if}
							</div>
							<div>
								<label for="create-block" class="block text-sm font-medium text-blue-800"
									>Block <span class="text-red-500">*</span></label
								>
								<select id="create-block" bind:value={createForm.block} class={inputCls}>
									<option value="">Select block…</option>
									{#each ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as letter (letter)}<option>{letter}</option>{/each}
								</select>
								{#if createErrors.block}<p class={errorCls}>{createErrors.block}</p>{/if}
							</div>
						</div>
					</div>
				{/if}

				<div class="flex justify-end gap-3 border-t border-gray-200 pt-5">
					<button
						type="button"
						onclick={() => (showCreateModal = false)}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
						>Cancel</button
					>
					<button
						type="submit"
						disabled={createLoading}
						class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 disabled:opacity-60"
					>
						{#if createLoading}<RefreshCw
								size={15}
								class="animate-spin"
								aria-hidden="true"
							/>{:else}<Plus size={15} aria-hidden="true" />{/if}
						Create User
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ─── Import Modal ─────────────────────────────────────────────────────────── -->
{#if importRole}
	{#snippet passwordField()}
		<div>
			<label for="import-temp-password" class="block text-sm font-semibold text-gray-900">Temporary password</label>
			<p class="mt-0.5 text-xs text-gray-500">Every imported account starts on this password. At least 8 characters.</p>
			<input
				id="import-temp-password"
				type="text"
				bind:value={temporaryPassword}
				autocomplete="off"
				placeholder="Enter a temporary password"
				class="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-100 focus:outline-none"
			/>
		</div>
	{/snippet}
	<SpreadsheetImportModal
		title={importRole === 'student' ? 'Import Students' : 'Import Instructors'}
		description={importRole === 'student'
			? 'Create student accounts. Add a course code and section to enrol a student into that class.'
			: 'Create instructor accounts. Import instructors before the class codes that name them.'}
		columns={importRole === 'student' ? STUDENT_IMPORT_COLUMNS : NAME_COLUMNS}
		templateName={importRole === 'student' ? 'students_import_template' : 'instructors_import_template'}
		extra={passwordField}
		ready={temporaryPassword.trim().length >= 8}
		onImport={importUserRows}
		onImported={refreshAfterImport}
		onClose={() => (importRole = null)}
	/>
{/if}

<!-- ─── Edit User Modal ───────────────────────────────────────────────────────── -->
{#if editUser}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={() => (editUser = null)}
			aria-label="Close modal"
			tabindex="-1"
		></button>

		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
				role="dialog"
				aria-modal="true"
				aria-labelledby="edit-user-title"
			>
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
					<div class="px-6 py-5">
						<div class="flex items-start gap-4">
							<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/30">
								<UserRound size={22} class="text-white" aria-hidden="true" />
							</div>
							<div class="min-w-0 flex-1">
								<h2 id="edit-user-title" class="text-lg font-bold text-gray-900">Edit User</h2>
								<p class="mt-0.5 text-sm text-gray-500 truncate">{editUser.email}</p>
							</div>
							<button
								type="button"
								onclick={() => (editUser = null)}
								class="shrink-0 rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
								aria-label="Close edit user dialog"
							>
								<X size={20} />
							</button>
						</div>
					</div>
				</div>

				<!-- Body -->
				<div class="space-y-4 overflow-y-auto px-6 py-6">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="edit-first-name" class="block text-sm font-medium text-gray-700">First Name</label>
							<input id="edit-first-name" type="text" bind:value={editForm.firstName} class={inputCls} />
						</div>
						<div>
							<label for="edit-last-name" class="block text-sm font-medium text-gray-700">Last Name</label>
							<input id="edit-last-name" type="text" bind:value={editForm.lastName} class={inputCls} />
						</div>
					</div>
					<div>
						<label for="edit-role" class="block text-sm font-medium text-gray-700">Role</label>
						<select id="edit-role" bind:value={editForm.role} class={inputCls}>
							<option value="student">Student</option>
							<option value="instructor">Instructor</option>
							<option value="custodian">Custodian</option>
							<option value="superadmin">Superadmin</option>
							<option value="admin">Admin</option>
						</select>
					</div>
					{#if editForm.role === 'student'}
						<div class="space-y-4 rounded-xl border border-pink-100 bg-pink-50 p-4">
							<p class="text-sm font-semibold text-pink-900">Student Details</p>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label for="edit-year-level" class="block text-sm font-medium text-pink-800">Year Level</label>
									<select id="edit-year-level" bind:value={editForm.yearLevel} class={inputCls}>
										<option value="">Select year…</option>
										<option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option>
									</select>
								</div>
								<div>
									<label for="edit-block" class="block text-sm font-medium text-pink-800">Block</label>
									<select id="edit-block" bind:value={editForm.block} class={inputCls}>
										<option value="">Select block…</option>
										{#each ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as letter (letter)}<option>{letter}</option>{/each}
									</select>
								</div>
							</div>
						</div>
					{/if}
					<div class="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
						<div>
							<p class="text-sm font-medium text-gray-900">Account Status</p>
							<p class="text-xs text-gray-500">
								{editForm.isActive ? 'User can access the system' : 'User is blocked from logging in'}
							</p>
						</div>
						<button
							type="button"
							onclick={() => (editForm.isActive = !editForm.isActive)}
							class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none {editForm.isActive ? 'bg-emerald-500' : 'bg-gray-300'}"
							role="switch"
							aria-checked={editForm.isActive}
							aria-label="Toggle account status"
						>
							<span class="sr-only">{editForm.isActive ? 'Deactivate' : 'Activate'} account</span>
							<span class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 {editForm.isActive ? 'translate-x-5' : 'translate-x-0'}"></span>
						</button>
					</div>
				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-6 py-4">
					<div class="flex justify-end gap-3">
						<button
							type="button"
							onclick={() => (editUser = null)}
							class="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
						>Cancel</button>
						<button
							type="button"
							onclick={handleEditUser}
							disabled={editLoading}
							class="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 active:scale-95 disabled:opacity-60"
						>
							{#if editLoading}<RefreshCw size={15} class="animate-spin" aria-hidden="true" />{/if}
							Save Changes
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ─── Main Page ─────────────────────────────────────────────────────────────── -->
<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">User Management</h1>
			<p class="mt-0.5 text-sm text-gray-500">
				Manage all users across the system with role-based access control
			</p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<div class="-mb-px flex gap-1" role="tablist" aria-label="User management tabs">
			{#each [['all', 'All Users'], ['inactive', 'Inactive Users']] as [tab, label]}
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === tab}
					aria-controls="{tab}-panel"
					onclick={() => {
						activeTab = tab as Tab;
						loadUsers();
					}}
					class="border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
					tab
						? 'border-pink-600 text-pink-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>{label}</button
				>
			{/each}
		</div>
	</div>

	<!-- ── ALL USERS TAB ─────────────────────────────────────────────────────── -->
	{#if activeTab === 'all' || activeTab === 'inactive'}
		<div class="flex flex-col gap-4" role="tabpanel" id="{activeTab}-panel" aria-labelledby="{activeTab}-tab">
			<!-- Stats -->
			{#if activeTab === 'all'}
				<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
					{#if loading && stats.total === 0}
						{#each Array(4) as _}
							<div class="rounded-lg bg-white p-3 shadow sm:p-5">
								<div class="animate-pulse space-y-2">
									<div class="h-3 w-20 rounded bg-gray-200"></div>
									<div class="h-7 w-12 rounded bg-gray-200"></div>
									<div class="h-3 w-28 rounded bg-gray-200"></div>
								</div>
							</div>
						{/each}
					{:else}
						<button
							type="button"
							onclick={() => {
								selectedStatus = 'all';
								selectedRole = 'all';
								onFilterChange();
							}}
							class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-gray-500/20 cursor-pointer sm:p-5
							{selectedStatus === 'all' && selectedRole === 'all' ? 'border border-gray-300 bg-gray-50/50 ring-1 ring-gray-200 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-gray-200/50 hover:bg-gray-50/50'}"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total Users</p>
									<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{stats.total.toLocaleString()}</p>
									<p class="mt-0.5 text-xs text-gray-500">All roles combined</p>
								</div>
								<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:h-12 sm:w-12">
									<Users size={18} class="text-gray-500 sm:hidden" aria-hidden="true" />
									<Users size={24} class="hidden text-gray-500 sm:block" aria-hidden="true" />
								</div>
							</div>
						</button>
						<button
							type="button"
							onclick={() => {
								selectedStatus = 'active';
								selectedRole = 'all';
								onFilterChange();
							}}
							class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer sm:p-5
							{selectedStatus === 'active' ? 'border border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-emerald-200/50 hover:bg-gray-50/50'}"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Active Users</p>
									<p class="mt-1 text-2xl font-semibold text-emerald-600 sm:mt-2 sm:text-3xl">{stats.active.toLocaleString()}</p>
									<p class="mt-0.5 text-xs text-gray-500">{stats.total ? ((stats.active / stats.total) * 100).toFixed(1) : 0}% of total</p>
								</div>
								<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 sm:h-12 sm:w-12">
									<UserCheck size={18} class="text-emerald-600 sm:hidden" aria-hidden="true" />
									<UserCheck size={24} class="hidden text-emerald-600 sm:block" aria-hidden="true" />
								</div>
							</div>
						</button>
						<button
							type="button"
							onclick={() => {
								selectedStatus = 'inactive';
								selectedRole = 'all';
								onFilterChange();
							}}
							class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer sm:p-5
							{selectedStatus === 'inactive' ? 'border border-amber-200 bg-amber-50/30 ring-1 ring-amber-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-amber-200/50 hover:bg-gray-50/50'}"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Inactive Users</p>
									<p class="mt-1 text-2xl font-semibold text-gray-600 sm:mt-2 sm:text-3xl">{stats.inactive.toLocaleString()}</p>
									<p class="mt-0.5 text-xs text-amber-600">Require attention</p>
								</div>
								<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12">
									<UserX size={18} class="text-amber-500 sm:hidden" aria-hidden="true" />
									<UserX size={24} class="hidden text-amber-500 sm:block" aria-hidden="true" />
								</div>
							</div>
						</button>
						<button
							type="button"
							onclick={() => {
								selectedStatus = 'new-this-month';
								selectedRole = 'all';
								onFilterChange();
							}}
							class="w-full text-left rounded-lg p-3 shadow transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-pink-500/20 cursor-pointer sm:p-5
							{selectedStatus === 'new-this-month' ? 'border border-pink-200 bg-pink-50/30 ring-1 ring-pink-200/50 shadow-md' : 'bg-white border border-transparent hover:shadow-md hover:border-pink-200/50 hover:bg-gray-50/50'}"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">New This Month</p>
									<p class="mt-1 text-2xl font-semibold text-pink-600 sm:mt-2 sm:text-3xl">{stats.newThisMonth.toLocaleString()}</p>
									<p class="mt-0.5 text-xs text-gray-500">Registered this month</p>
								</div>
								<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 sm:h-12 sm:w-12">
									<UserPlus size={18} class="text-pink-500 sm:hidden" aria-hidden="true" />
									<UserPlus size={24} class="hidden text-pink-500 sm:block" aria-hidden="true" />
								</div>
							</div>
						</button>
					{/if}
				</div>
			{/if}

			<!-- Role distribution pills -->
			{#if activeTab === 'all'}
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						onclick={() => {
							selectedRole = selectedRole === 'student' ? 'all' : 'student';
							onFilterChange();
						}}
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-98 focus:outline-none focus:ring-2 focus:ring-blue-500/20
						{selectedRole === 'student' ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-xs' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100/50'}"
					>
						Students <span class="font-bold">{stats.students}</span>
					</button>
					<button
						type="button"
						onclick={() => {
							selectedRole = selectedRole === 'instructor' ? 'all' : 'instructor';
							onFilterChange();
						}}
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-98 focus:outline-none focus:ring-2 focus:ring-violet-500/20
						{selectedRole === 'instructor' ? 'border-violet-300 bg-violet-100 text-violet-800 shadow-xs' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100/50'}"
					>
						Instructors <span class="font-bold">{stats.instructors}</span>
					</button>
					<button
						type="button"
						onclick={() => {
							selectedRole = selectedRole === 'custodian' ? 'all' : 'custodian';
							onFilterChange();
						}}
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-98 focus:outline-none focus:ring-2 focus:ring-pink-500/20
						{selectedRole === 'custodian' ? 'border-pink-300 bg-pink-100 text-pink-800 shadow-xs' : 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100/50'}"
					>
						Custodians <span class="font-bold">{stats.custodians}</span>
					</button>
					<button
						type="button"
						onclick={() => {
							selectedRole = selectedRole === 'admin' ? 'all' : 'admin';
							onFilterChange();
						}}
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-98 focus:outline-none focus:ring-2 focus:ring-teal-500/20
						{selectedRole === 'admin' ? 'border-teal-300 bg-teal-100 text-teal-800 shadow-xs' : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100/50'}"
					>
						Admins <span class="font-bold">{stats.admins}</span>
					</button>
				</div>
			{/if}

			<!-- Filters -->
			<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<div class="relative flex-1">
						<Search
							size={16}
							class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
							aria-hidden="true"
						/>
						<input
							type="text"
							bind:value={searchQuery}
							oninput={onSearchInput}
							placeholder="Search by name or email…"
							class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-9 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							aria-label="Search users by name or email"
						/>
					</div>
					<select
						bind:value={selectedRole}
						onchange={onFilterChange}
						class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
						aria-label="Filter by role"
					>
						<option value="all">All Roles</option>
						<option value="student">Student</option>
						<option value="instructor">Instructor</option>
						<option value="custodian">Custodian</option>
						<option value="superadmin">Superadmin</option>
						<option value="admin">Admin</option>
					</select>
					{#if activeTab === 'all'}
						<select
							bind:value={selectedStatus}
							onchange={onFilterChange}
							class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							aria-label="Filter by status"
						>
							<option value="all">All Status</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
							<option value="new-this-month">New This Month</option>
						</select>
					{/if}
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => (importRole = 'student')}
							class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
						>
							<Upload size={16} aria-hidden="true" />Import Students
						</button>
						<button
							type="button"
							onclick={() => (importRole = 'instructor')}
							class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
						>
							<Upload size={16} aria-hidden="true" />Import Instructors
						</button>
						<button
							type="button"
							onclick={() => (showCreateModal = true)}
							class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700"
							aria-label="Add new user"
						>
							<Plus size={16} aria-hidden="true" />Add User
						</button>
					</div>
				</div>
			</div>

			<!-- Table -->
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				{#if loading && users.length === 0}
					<div class="p-6">
						<div class="animate-pulse space-y-4">
							<!-- Table Header Skeleton -->
							<div class="hidden gap-4 border-b border-gray-200 pb-4 md:flex">
								<div class="h-4 w-1/4 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/12 rounded bg-gray-200"></div>
							</div>
							<!-- Rows Skeleton -->
							{#each Array(6) as _}
								<div
									class="flex flex-col gap-4 border-b border-gray-100 py-3 last:border-0 md:flex-row md:items-center"
								>
									<div class="flex items-center gap-3 md:w-1/4">
										<div class="h-10 w-10 shrink-0 rounded-full bg-gray-200"></div>
										<div class="space-y-2">
											<div class="h-4 w-24 rounded bg-gray-200"></div>
											<div class="h-3 w-32 rounded bg-gray-200"></div>
										</div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-6 w-20 rounded-full bg-gray-200"></div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-6 w-16 rounded-full bg-gray-200"></div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-4 w-28 rounded bg-gray-200"></div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-4 w-20 rounded bg-gray-200"></div>
									</div>
									<div class="hidden justify-end md:flex md:w-1/12">
										<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else if users.length === 0}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
							<Search size={28} class="text-gray-400" aria-hidden="true" />
						</div>
						<p class="text-base font-semibold text-gray-900">No users found</p>
						<p class="mt-1 text-sm text-gray-500">Try adjusting your search or filters</p>
					</div>
				{:else}
					<!-- Desktop table -->
					<div class="hidden overflow-x-auto md:block">
						<table class="w-full">
							<thead class="border-b border-gray-200 bg-gray-50">
								<tr>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>User</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Role</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Status</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Class Info</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Last Login</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Joined</th
									>
									<th
										class="px-6 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Actions</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each users as user (user.id)}
									<tr class="group transition-colors hover:bg-gray-50">
										<td class="px-6 py-4">
											<div class="flex items-center gap-3">
												<!-- Smart avatar: photo → initials fallback -->
												<div class="relative h-10 w-10 shrink-0">
													{#if getAvatarUrl(user)}
														<img
															src={getAvatarUrl(user)}
															alt="{user.firstName} {user.lastName}"
															class="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-white transition-opacity duration-300"
															onerror={(e) => {
																// If Cloudinary URL fails, remove override so initials show
																(e.currentTarget as HTMLImageElement).style.display = 'none';
																photoOverrides = new Map(photoOverrides.set(user.id, null));
															}}
														/>
													{:else}
														<div
															class="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
																user.role
															)} text-sm font-bold text-white shadow-sm"
														>
															{avatar(user)}
														</div>
													{/if}
												</div>
												<div class="min-w-0">
													<p class="truncate font-semibold text-gray-900">
														{user.firstName}
														{user.lastName}
													</p>
													<p class="truncate text-xs text-gray-500">{user.email}</p>
												</div>
											</div>
										</td>
										<td class="px-6 py-4">
											<span
												class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {roleBadge(
													user.role
												)}"
											>
												{user.role.charAt(0).toUpperCase() + user.role.slice(1)}
											</span>
										</td>
										<td class="px-6 py-4">
											<span
												class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {statusBadge(
													user.isActive
												)}"
											>
												{user.isActive ? 'Active' : 'Inactive'}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">
											{#if user.yearLevel && user.block}
												<span class="font-medium">{user.yearLevel}</span> · Block {user.block}{#if user.program}
													· {user.program}{/if}{#if user.enrollmentStatus && user.enrollmentStatus !== 'Officially Enrolled'}
													· <span class="font-medium text-amber-700">{user.enrollmentStatus}</span>{/if}
											{:else}
												<span class="text-gray-400">—</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-sm text-gray-500">{timeAgo(user.lastLogin)}</td>
										<td class="px-6 py-4 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
										<td class="px-6 py-4 text-right">
											<ActionMenu
												align="right"
												side="bottom"
												triggerLabel="User actions for {user.firstName} {user.lastName}"
												items={[
													{
														label: 'Edit User',
														icon: Edit,
														variant: 'default',
														action: () => openEdit(user)
													},
													{
														label: 'Reset Password',
														icon: KeyRound,
														variant: 'default',
														action: () => handleResetPassword(user)
													},
													{
														label: user.isActive ? 'Deactivate' : 'Reactivate',
														icon: user.isActive ? UserX : UserCheck,
														variant: user.isActive ? 'warning' : 'success',
														action: () => handleToggleActive(user),
														divider: true
													},
													{
														label: 'Remove User',
														icon: Trash2,
														variant: 'danger',
														action: () => handleDelete(user)
													}
												]}
											/>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Mobile cards -->
					<div class="divide-y divide-gray-100 md:hidden">
						{#each users as user (user.id)}
							<div class="p-4 transition-colors hover:bg-gray-50">
								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 items-center gap-3">
										<!-- Smart avatar: photo → initials fallback -->
										<div class="relative h-10 w-10 shrink-0">
											{#if getAvatarUrl(user)}
												<img
													src={getAvatarUrl(user)}
													alt="{user.firstName} {user.lastName}"
													class="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-white transition-opacity duration-300"
													onerror={(e) => {
														(e.currentTarget as HTMLImageElement).style.display = 'none';
														photoOverrides = new Map(photoOverrides.set(user.id, null));
													}}
												/>
											{:else}
												<div
													class="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
														user.role
													)} text-sm font-bold text-white"
												>
													{avatar(user)}
												</div>
											{/if}
										</div>
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-gray-900">
												{user.firstName}
												{user.lastName}
											</p>
											<p class="truncate text-xs text-gray-500">{user.email}</p>
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<span
											class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {roleBadge(
												user.role
											)}">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span
										>
										<button
											type="button"
											onclick={() => openEdit(user)}
											class="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100"
											aria-label="Edit {user.firstName} {user.lastName}"
										>
											<Edit size={16} aria-hidden="true" />
										</button>
									</div>
								</div>
								<div class="mt-3 flex items-center gap-4 text-xs text-gray-500">
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {statusBadge(
											user.isActive
										)}">{user.isActive ? 'Active' : 'Inactive'}</span
									>
									{#if user.yearLevel}<span>{user.yearLevel} · Block {user.block}{user.program ? ` · ${user.program}` : ''}</span>{/if}
									{#if user.enrollmentStatus && user.enrollmentStatus !== 'Officially Enrolled'}<span class="font-medium text-amber-700">{user.enrollmentStatus}</span>{/if}
									<span>Last login: {timeAgo(user.lastLogin)}</span>
								</div>
							</div>
						{/each}
					</div>

					<!-- Pagination -->
					{#if pagination.totalPages > 1}
						<Pagination
							currentPage={pagination.page}
							totalPages={pagination.totalPages}
							totalItems={pagination.total}
							itemsPerPage={pagination.limit}
							onPageChange={(page: number) => { pagination.page = page; loadUsers(); }}
							class="rounded-none border-x-0 border-b-0 border-t shadow-none"
						/>
					{/if}
				{/if}
			</div>
		</div>
		<!-- End tabpanel -->
	{/if}

	<!-- Close dropdown on outside click -->
	{#if openDropdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-20" onclick={() => (openDropdown = null)} role="presentation"></div>
	{/if}
</div>
