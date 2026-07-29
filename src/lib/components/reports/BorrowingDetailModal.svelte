<script lang="ts" module>
	export type BorrowEntry = {
		id: string;
		requestId: string;
		requestDate: string;
		requestStatus: string;
		name: string;
		category: string;
		quantity: number;
		studentName: string;
		studentEmail: string;
	};
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { X, Package, User, Calendar, Hash, Layers } from 'lucide-svelte';

	interface Props {
		open: boolean;
		/** 'entry' = one specific borrow row; 'item' = aggregate by item; 'borrower' = by person. */
		kind: 'entry' | 'item' | 'borrower' | undefined;
		subject:
			| ({ name?: string; category?: string; studentName?: string; studentEmail?: string } & Partial<BorrowEntry>)
			| null;
		entries: BorrowEntry[];
		onClose: () => void;
	}
	let { open, kind, subject, entries, onClose }: Props = $props();

	// For 'item' / 'borrower' — the list of matching entries.
	const rows = $derived.by(() => {
		if (!open || !subject) return [];
		if (kind === 'item') {
			return entries.filter(
				(e) => e.name === subject.name && (!subject.category || e.category === subject.category)
			);
		}
		if (kind === 'borrower') {
			return entries.filter(
				(e) =>
					(subject.studentEmail && e.studentEmail === subject.studentEmail) ||
					e.studentName === subject.studentName
			);
		}
		return [];
	});
	const totalQty = $derived(rows.reduce((s, e) => s + (e.quantity || 0), 0));
	const requestCount = $derived(new Set(rows.map((e) => e.requestId)).size);
	const uniqueOther = $derived(
		kind === 'item'
			? new Set(rows.map((e) => e.studentEmail || e.studentName)).size
			: new Set(rows.map((e) => e.name)).size
	);

	// For 'entry' — the other items borrowed in the same request.
	const requestItems = $derived.by(() => {
		if (!open || kind !== 'entry' || !subject?.requestId) return [];
		return entries.filter((e) => e.requestId === subject.requestId);
	});

	const title = $derived(
		kind === 'borrower' ? (subject?.studentName ?? 'Borrower') : (subject?.name ?? 'Item')
	);
	const sub = $derived(
		kind === 'borrower' ? (subject?.studentEmail ?? '') : (subject?.category || 'Uncategorized')
	);

	function fmtDate(d: string | undefined): string {
		if (!d) return '—';
		const dt = new Date(d);
		return isNaN(dt.getTime())
			? d.slice(0, 10)
			: dt.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
	function statusLabel(s: string | undefined): string {
		return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
	}
	function statusClass(s: string | undefined): string {
		if (s && ['returned', 'resolved'].includes(s)) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10';
		if (s && ['borrowed', 'ready_for_pickup', 'approved_instructor'].includes(s)) return 'bg-amber-50 text-amber-700 ring-amber-600/10';
		if (s && ['missing', 'rejected', 'cancelled'].includes(s)) return 'bg-rose-50 text-rose-700 ring-rose-600/10';
		return 'bg-gray-100 text-gray-600 ring-gray-500/10';
	}
	function shortReq(id: string | undefined): string {
		return id ? `#${id.slice(-6).toUpperCase()}` : '—';
	}
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onClose(); }} />

{#if open && subject}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onclick={onClose}></button>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
				in:fly={{ y: 16, duration: 220, easing: cubicOut }}
			>
				<!-- Header -->
				<div class="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
					<div class="flex min-w-0 items-start gap-3">
						<div class="mt-0.5 rounded-full bg-pink-100 p-2.5 text-pink-600">
							{#if kind === 'borrower'}<User class="h-5 w-5" />{:else}<Package class="h-5 w-5" />{/if}
						</div>
						<div class="min-w-0">
							<h2 class="truncate text-lg font-bold text-gray-900">{title}</h2>
							<p class="truncate text-xs text-gray-500">{sub}</p>
						</div>
					</div>
					<button
						type="button"
						onclick={onClose}
						class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				{#if kind === 'entry'}
					<!-- Specific borrow-entry detail -->
					<div class="space-y-4 px-5 py-4 sm:px-6">
						<dl class="grid grid-cols-2 gap-x-4 gap-y-3">
							<div class="col-span-2">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Borrower</dt>
								<dd class="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-gray-900">
									<User class="h-3.5 w-3.5 text-gray-400" />{subject.studentName || 'Unknown Student'}
								</dd>
								<dd class="text-xs text-gray-500">{subject.studentEmail || '—'}</dd>
							</div>
							<div>
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Quantity</dt>
								<dd class="mt-0.5 text-sm font-bold text-pink-600">×{subject.quantity}</dd>
							</div>
							<div>
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</dt>
								<dd class="mt-0.5">
									<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset {statusClass(subject.requestStatus)}">
										{statusLabel(subject.requestStatus)}
									</span>
								</dd>
							</div>
							<div>
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Request</dt>
								<dd class="mt-0.5 flex items-center gap-1 text-sm font-medium text-gray-900">
									<Hash class="h-3.5 w-3.5 text-gray-400" />{shortReq(subject.requestId)}
								</dd>
							</div>
							<div>
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Borrowed on</dt>
								<dd class="mt-0.5 flex items-center gap-1 text-sm text-gray-700">
									<Calendar class="h-3.5 w-3.5 text-gray-400" />{fmtDate(subject.requestDate)}
								</dd>
							</div>
						</dl>

						<div class="border-t border-gray-100 pt-3">
							<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
								Items in this request ({requestItems.length})
							</p>
							<div class="max-h-[36vh] space-y-2 overflow-y-auto pr-1">
								{#each requestItems as e (e.id)}
									<div class="flex items-center justify-between gap-3 rounded-lg border p-2.5 {e.name === subject.name && e.quantity === subject.quantity ? 'border-pink-300 bg-pink-50/40' : 'border-gray-200 bg-white'}">
										<div class="min-w-0">
											<p class="flex items-center gap-1.5 truncate text-sm font-medium text-gray-900">
												<Layers class="h-3.5 w-3.5 shrink-0 text-gray-400" />{e.name}
											</p>
											<p class="truncate text-xs text-gray-500">{e.category || 'Uncategorized'}</p>
										</div>
										<span class="shrink-0 text-sm font-bold text-pink-600">×{e.quantity}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{:else}
					<!-- Aggregate: summary tiles + entry list -->
					<div class="grid grid-cols-3 gap-3 px-5 py-4 sm:px-6">
						<div class="rounded-xl bg-gray-50 p-3 text-center">
							<p class="text-xl font-bold text-gray-900">{totalQty}</p>
							<p class="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">Total qty</p>
						</div>
						<div class="rounded-xl bg-gray-50 p-3 text-center">
							<p class="text-xl font-bold text-gray-900">{requestCount}</p>
							<p class="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">Requests</p>
						</div>
						<div class="rounded-xl bg-gray-50 p-3 text-center">
							<p class="text-xl font-bold text-gray-900">{uniqueOther}</p>
							<p class="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
								{kind === 'item' ? 'Borrowers' : 'Items'}
							</p>
						</div>
					</div>

					<div class="border-t border-gray-100 px-5 py-3 sm:px-6">
						<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
							{kind === 'item' ? 'Every time this item was borrowed' : 'Everything this person borrowed'}
						</p>
						{#if rows.length === 0}
							<p class="py-6 text-center text-sm text-gray-400">No detailed entries in this range.</p>
						{:else}
							<div class="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
								{#each rows as e (e.id)}
									<div class="rounded-lg border border-gray-200 bg-white p-3">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												{#if kind === 'item'}
													<p class="flex items-center gap-1.5 truncate text-sm font-medium text-gray-900">
														<User class="h-3.5 w-3.5 shrink-0 text-gray-400" />{e.studentName}
													</p>
													<p class="truncate text-xs text-gray-500">{e.studentEmail}</p>
												{:else}
													<p class="flex items-center gap-1.5 truncate text-sm font-medium text-gray-900">
														<Layers class="h-3.5 w-3.5 shrink-0 text-gray-400" />{e.name}
													</p>
													<p class="truncate text-xs text-gray-500">{e.category || 'Uncategorized'}</p>
												{/if}
												<p class="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
													<Calendar class="h-3 w-3" />{fmtDate(e.requestDate)}
													<span class="text-gray-300">·</span>
													<Hash class="h-3 w-3" />{shortReq(e.requestId)}
												</p>
											</div>
											<div class="flex shrink-0 flex-col items-end gap-1">
												<span class="text-sm font-bold text-pink-600">×{e.quantity}</span>
												<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset {statusClass(e.requestStatus)}">
													{statusLabel(e.requestStatus)}
												</span>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
