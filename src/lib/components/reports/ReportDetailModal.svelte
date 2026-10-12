<script lang="ts">
	/**
	 * Shows whatever `openReportDetail` was given: the item or record behind a
	 * figure in Reports & Analytics, with its photo, facts and related records.
	 * Mounted once by the reports screen.
	 */
	import { X, Package, FileText, ExternalLink } from 'lucide-svelte';
	import { reportDetail, closeReportDetail, type DetailTone, type DetailSection } from './reportDetail.svelte';

	/** Long lists are shown a page at a time so the window stays quick. */
	const PAGE = 25;

	const detail = $derived(reportDetail.current);
	let shown = $state<Record<string, number>>({});

	// A new detail starts every list back at its first page.
	$effect(() => {
		void detail;
		shown = {};
	});

	const TONE: Record<DetailTone, string> = {
		good: 'bg-emerald-100 text-emerald-800',
		bad: 'bg-rose-100 text-rose-800',
		warn: 'bg-amber-100 text-amber-800',
		info: 'bg-blue-100 text-blue-800',
		neutral: 'bg-gray-100 text-gray-700'
	};
	const TONE_TEXT: Record<DetailTone, string> = {
		good: 'text-emerald-700',
		bad: 'text-rose-700',
		warn: 'text-amber-700',
		info: 'text-blue-700',
		neutral: 'text-gray-900'
	};

	const visible = (section: DetailSection) => section.rows.slice(0, shown[section.title] ?? PAGE);
</script>

<svelte:window
	onkeydown={(e) => {
		if (detail && e.key === 'Escape') closeReportDetail();
	}}
/>

{#snippet thumb(picture: string | null, name: string, size: string)}
	{#if picture}
		<img src={picture} alt={name} loading="lazy" class="{size} shrink-0 rounded-lg border border-gray-200 object-cover" />
	{:else}
		<div class="{size} flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-400" aria-hidden="true">
			<Package class="h-1/2 w-1/2" />
		</div>
	{/if}
{/snippet}

{#if detail}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={detail.title}>
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onclick={closeReportDetail}></button>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div class="animate-scaleIn relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
				<div class="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
					<div class="flex min-w-0 items-center gap-3">
						{#if detail.picture !== undefined}
							{@render thumb(detail.picture, detail.title, 'h-14 w-14')}
						{/if}
						<div class="min-w-0">
							<h2 class="text-lg font-bold break-words text-gray-900">{detail.title}</h2>
							{#if detail.subtitle}<p class="text-xs text-gray-500">{detail.subtitle}</p>{/if}
							{#if detail.badge}
								<span class="mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold {TONE[detail.badge.tone]}">{detail.badge.label}</span>
							{/if}
						</div>
					</div>
					<button
						type="button"
						onclick={closeReportDetail}
						class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
					{#if detail.stat}
						<div class="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
							<span class="text-sm font-medium text-gray-600">{detail.stat.label}</span>
							<span class="text-2xl font-bold tabular-nums {TONE_TEXT[detail.stat.tone ?? 'neutral']}">{detail.stat.value}</span>
						</div>
					{/if}

					{#if detail.fields?.length}
						<dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
							{#each detail.fields as field (field.label)}
								<div class="min-w-0">
									<dt class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{field.label}</dt>
									<dd class="mt-0.5 text-sm break-words text-gray-900">
										{field.value === null || field.value === undefined || field.value === '' ? '—' : field.value}
									</dd>
								</div>
							{/each}
						</dl>
					{/if}

					{#if detail.note}
						<div>
							<p class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{detail.note.label}</p>
							<p class="mt-0.5 text-sm whitespace-pre-line text-gray-700">{detail.note.text}</p>
						</div>
					{/if}

					{#if detail.photos?.length}
						<div>
							<p class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Photos</p>
							<div class="mt-2 grid grid-cols-3 gap-2">
								{#each detail.photos as photo (photo)}
									<a href={photo} target="_blank" rel="noopener noreferrer" class="block overflow-hidden rounded-lg border border-gray-200">
										<img src={photo} alt="Inspection" loading="lazy" class="aspect-square w-full object-cover" />
									</a>
								{/each}
							</div>
						</div>
					{/if}

					{#if detail.files?.length}
						<div class="flex flex-wrap gap-2">
							{#each detail.files as file (file.url)}
								<a
									href={file.url}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
								>
									<FileText size={15} /> {file.label} <ExternalLink size={13} />
								</a>
							{/each}
						</div>
					{/if}

					{#each detail.sections ?? [] as section (section.title)}
						<section>
							<div class="mb-2 flex items-baseline justify-between gap-3">
								<h3 class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{section.title}</h3>
								{#if section.rows.length}<span class="text-xs text-gray-500">{section.rows.length}</span>{/if}
							</div>
							{#if section.rows.length === 0}
								<p class="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-600">
									{section.empty ?? 'Nothing to show.'}
								</p>
							{:else}
								<ul class="divide-y divide-gray-100 rounded-lg border border-gray-200">
									{#each visible(section) as row, i (i)}
										<li class="flex items-center gap-3 px-3 py-2.5">
											{#if row.picture !== undefined}
												{@render thumb(row.picture, row.title, 'h-10 w-10')}
											{/if}
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-semibold text-gray-900" title={row.title}>{row.title}</p>
												{#if row.subtitle}<p class="truncate text-xs text-gray-600" title={row.subtitle}>{row.subtitle}</p>{/if}
												{#if row.meta}<p class="truncate text-xs text-gray-500">{row.meta}</p>{/if}
											</div>
											<div class="flex shrink-0 flex-col items-end gap-1">
												{#if row.right}<span class="text-sm font-bold text-gray-900 tabular-nums">{row.right}</span>{/if}
												{#if row.badge}
													<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap {TONE[row.badge.tone]}">{row.badge.label}</span>
												{/if}
											</div>
										</li>
									{/each}
								</ul>
								{#if section.rows.length > (shown[section.title] ?? PAGE)}
									<button
										type="button"
										onclick={() => (shown[section.title] = (shown[section.title] ?? PAGE) + PAGE)}
										class="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
									>
										Show more ({section.rows.length - (shown[section.title] ?? PAGE)} left)
									</button>
								{/if}
							{/if}
						</section>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}
