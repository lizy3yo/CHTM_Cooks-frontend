<script lang="ts">
	/**
	 * One student's full damage & missing history, newest first.
	 */
	import { X, Download, PackageX, Wrench, ClipboardList, Store } from 'lucide-svelte';
	import type { StudentIncident, StudentIncidentSummary } from '$lib/api/studentIncidents';

	interface Props {
		open: boolean;
		summary: StudentIncidentSummary | null;
		incidents: StudentIncident[];
		loading: boolean;
		error: string | null;
		scopeLabel: string;
		exporting: boolean;
		onExport: () => void;
		onClose: () => void;
	}

	let { open, summary, incidents, loading, error, scopeLabel, exporting, onExport, onClose }: Props = $props();

	function fmt(iso: string | null, withTime = false): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
		});
	}

	const STATUS_BADGE: Record<StudentIncident['status'], { text: string; cls: string }> = {
		pending: { text: 'Replacement pending', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
		replaced: { text: 'Replaced', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
		recorded: { text: 'Recorded', cls: 'bg-gray-50 text-gray-600 ring-gray-500/20' }
	};

	function initials(name: string): string {
		const p = name.trim().split(/\s+/);
		return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
	}
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onClose(); }} />

{#if open && summary}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="incident-modal-title">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onclick={onClose}></button>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
			>
				<!-- Header -->
				<div class="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
					<div class="flex min-w-0 items-center gap-3">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
							{#if summary.profilePhotoUrl}
								<img src={summary.profilePhotoUrl} alt="" class="h-full w-full object-cover" />
							{:else}
								{initials(summary.studentName)}
							{/if}
						</div>
						<div class="min-w-0">
							<h2 id="incident-modal-title" class="truncate text-lg font-bold text-gray-900">{summary.studentName}</h2>
							<p class="truncate text-xs text-gray-500">
								{summary.email ?? '—'}{#if summary.yearLevel} · {summary.yearLevel}{/if}{#if summary.block} · Block {summary.block}{/if}
							</p>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onclick={onExport}
							disabled={exporting || loading || incidents.length === 0}
							class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
						>
							<Download class="h-3.5 w-3.5" />
							{exporting ? 'Exporting…' : 'Excel'}
						</button>
						<button type="button" onclick={onClose} class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
							<X class="h-5 w-5" />
						</button>
					</div>
				</div>

				<div class="space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
					<p class="text-xs text-gray-500">Showing: <span class="font-medium text-gray-700">{scopeLabel}</span></p>

					<!-- Summary -->
					<dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each [
							{ label: 'Damaged', value: summary.damaged, cls: 'text-amber-700' },
							{ label: 'Missing', value: summary.missing, cls: 'text-red-700' },
							{ label: 'Pending', value: summary.pending, cls: summary.pending ? 'text-rose-700' : 'text-gray-900' },
							{ label: 'Units still owed', value: summary.outstandingUnits, cls: summary.outstandingUnits ? 'text-rose-700' : 'text-gray-900' }
						] as m (m.label)}
							<div class="rounded-xl bg-gray-50 p-3 text-center">
								<dd class="text-xl font-bold {m.cls}">{m.value}</dd>
								<dt class="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{m.label}</dt>
							</div>
						{/each}
					</dl>

					<!-- Incidents -->
					{#if loading}
						<div class="animate-pulse space-y-2">
							{#each Array(4) as _}<div class="h-16 rounded-xl bg-gray-100"></div>{/each}
						</div>
					{:else if error}
						<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
					{:else if incidents.length === 0}
						<p class="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">No incidents in this period.</p>
					{:else}
						<ol class="space-y-2" aria-label="Incidents, newest first">
							{#each incidents as i (i.id)}
								{@const badge = STATUS_BADGE[i.status]}
								<li class="rounded-xl border border-gray-200 p-3 sm:p-4">
									<div class="flex items-start gap-3">
										<div class="mt-0.5 rounded-lg p-2 {i.type === 'missing' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}">
											{#if i.type === 'missing'}<PackageX class="h-4 w-4" />{:else}<Wrench class="h-4 w-4" />{/if}
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
												<p class="text-sm font-semibold text-gray-900">{i.itemName}</p>
												<span class="text-xs font-semibold {i.type === 'missing' ? 'text-red-600' : 'text-amber-600'}">
													{i.type === 'missing' ? 'Missing' : 'Damaged'} × {i.quantity}
												</span>
												<span class="ml-auto inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset {badge.cls}">{badge.text}</span>
											</div>
											<p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
												<span>{fmt(i.incidentAt, true)}</span>
												<span aria-hidden="true">·</span>
												<span class="inline-flex items-center gap-1">
													{#if i.source === 'walk_in'}<Store class="h-3 w-3" /> Walk-in{:else}<ClipboardList class="h-3 w-3" /> Request{/if}
													<span class="font-mono">{i.reference}</span>
												</span>
												{#if i.status === 'pending' && i.outstanding}
													<span aria-hidden="true">·</span><span class="text-rose-600">{i.outstanding} still owed</span>
												{/if}
												{#if i.status === 'pending' && i.dueDate}
													<span aria-hidden="true">·</span>
													<span class={new Date(i.dueDate) < new Date() ? 'font-medium text-red-600' : ''}>Due {fmt(i.dueDate)}</span>
												{/if}
												{#if i.resolvedAt}
													<span aria-hidden="true">·</span><span>Replaced {fmt(i.resolvedAt)}</span>
												{/if}
											</p>
											{#if i.notes}
												<p class="mt-1.5 text-xs text-gray-600">“{i.notes}”</p>
											{/if}
										</div>
									</div>
								</li>
							{/each}
						</ol>
						{#if incidents.some((i) => i.source === 'walk_in')}
							<p class="text-[11px] text-gray-400">Walk-in incidents are recorded at check-in; walk-ins have no replacement tracking.</p>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
