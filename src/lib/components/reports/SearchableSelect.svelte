<script lang="ts">
	import { ChevronDown, Search, Check, X } from 'lucide-svelte';
	import { tick } from 'svelte';

	type Opt = { id: string; label: string };
	interface Props {
		/** string in single mode, string[] in multiple mode. */
		value: string | string[];
		options: Opt[];
		/** Label for the "no filter" choice, e.g. "All Students". */
		allLabel: string;
		label?: string;
		placeholder?: string;
		/** Allow selecting several options; `value` becomes a string[]. */
		multiple?: boolean;
	}
	let {
		value = $bindable(),
		options,
		allLabel,
		label,
		placeholder = 'Type to search…',
		multiple = false
	}: Props = $props();

	let open = $state(false);
	let query = $state('');
	let btn: HTMLButtonElement;
	let posStyle = $state('');

	const q = $derived(query.trim().toLowerCase());
	const filtered = $derived(q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options);

	const selectedIds = $derived(
		multiple ? (Array.isArray(value) ? value : []) : value ? [value as string] : []
	);
	const isSelected = (id: string) => selectedIds.includes(id);

	const buttonLabel = $derived.by(() => {
		if (selectedIds.length === 0) return allLabel;
		if (selectedIds.length === 1) return options.find((o) => o.id === selectedIds[0])?.label ?? 'Selected';
		return `${selectedIds.length} selected`;
	});
	const selectedChips = $derived(
		multiple
			? selectedIds.map((id) => ({ id, label: options.find((o) => o.id === id)?.label ?? id }))
			: []
	);

	function place() {
		const r = btn.getBoundingClientRect();
		const dropH = 300;
		const spaceBelow = window.innerHeight - r.bottom;
		const openUp = spaceBelow < dropH && r.top > spaceBelow;
		// Fixed positioning escapes the modal's overflow clipping.
		posStyle = openUp
			? `left:${r.left}px; width:${r.width}px; bottom:${window.innerHeight - r.top + 6}px;`
			: `left:${r.left}px; width:${r.width}px; top:${r.bottom + 6}px;`;
	}

	async function toggle() {
		if (open) {
			open = false;
			return;
		}
		place();
		query = '';
		open = true;
		await tick();
		(document.getElementById('ss-search') as HTMLInputElement | null)?.focus();
	}

	function choose(id: string) {
		if (multiple) {
			const cur = Array.isArray(value) ? value : [];
			value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
			// keep the dropdown open so several can be picked in a row
		} else {
			value = id;
			open = false;
		}
	}

	function chooseAll() {
		value = multiple ? [] : '';
		if (!multiple) open = false;
	}

	function removeChip(id: string) {
		if (!multiple) return;
		const cur = Array.isArray(value) ? value : [];
		value = cur.filter((x) => x !== id);
	}

	$effect(() => {
		if (!open) return;
		const reposition = () => place();
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		return () => {
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
		};
	});
</script>

<div class="w-full">
	{#if label}
		<span class="block text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
	{/if}
	<button
		bind:this={btn}
		type="button"
		onclick={toggle}
		class="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
	>
		<span class="truncate {selectedIds.length ? 'text-gray-900' : 'text-gray-500'}">{buttonLabel}</span>
		<ChevronDown class="h-4 w-4 shrink-0 text-gray-400 transition-transform {open ? 'rotate-180' : ''}" />
	</button>

	{#if multiple && selectedChips.length}
		<div class="mt-1.5 flex flex-wrap gap-1">
			{#each selectedChips as chip (chip.id)}
				<span class="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700 ring-1 ring-pink-600/10">
					<span class="max-w-[140px] truncate">{chip.label}</span>
					<button type="button" onclick={() => removeChip(chip.id)} aria-label="Remove" class="text-pink-500 hover:text-pink-700">
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}
		</div>
	{/if}
</div>

{#if open}
	<!-- Outside-click catcher -->
	<button
		type="button"
		class="fixed inset-0 z-[60] cursor-default"
		aria-label="Close"
		onclick={() => (open = false)}
	></button>
	<div
		class="fixed z-[61] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
		style={posStyle}
	>
		<div class="border-b border-gray-100 p-2">
			<div class="relative">
				<Search class="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
				<input
					id="ss-search"
					bind:value={query}
					{placeholder}
					class="w-full rounded-md border border-gray-200 py-1.5 pr-2 pl-8 text-sm focus:border-pink-500 focus:outline-none"
					onkeydown={(e) => e.key === 'Escape' && (open = false)}
				/>
			</div>
		</div>
		<ul class="max-h-56 overflow-y-auto py-1 text-sm">
			<li>
				<button
					type="button"
					onclick={chooseAll}
					class="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-pink-50 {selectedIds.length ===
					0
						? 'font-medium text-pink-700'
						: 'text-gray-700'}"
				>
					{allLabel}
					{#if selectedIds.length === 0}<Check class="h-4 w-4 shrink-0" />{/if}
				</button>
			</li>
			{#each filtered as o (o.id)}
				<li>
					<button
						type="button"
						onclick={() => choose(o.id)}
						class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-pink-50 {isSelected(o.id)
							? 'font-medium text-pink-700'
							: 'text-gray-700'}"
					>
						<span class="truncate">{o.label}</span>
						{#if isSelected(o.id)}<Check class="h-4 w-4 shrink-0" />{/if}
					</button>
				</li>
			{/each}
			{#if filtered.length === 0}
				<li class="px-3 py-3 text-center text-xs text-gray-400">No matches for “{query}”</li>
			{/if}
		</ul>
		{#if multiple}
			<div class="flex items-center justify-between border-t border-gray-100 px-3 py-1.5 text-xs">
				<span class="text-gray-400">{selectedIds.length} selected</span>
				<button type="button" onclick={() => (open = false)} class="font-semibold text-pink-600 hover:text-pink-700">Done</button>
			</div>
		{/if}
	</div>
{/if}
