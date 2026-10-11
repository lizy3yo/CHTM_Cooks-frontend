<script lang="ts">
	/**
	 * A search box that remembers.
	 *
	 * The term in the box survives leaving the page and coming back (for the
	 * browser session), and the last few searches are offered again when the
	 * box is focused, the way a search engine does. History is kept in this
	 * browser only, under `storageKey`, so pass a key that includes the user.
	 */
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { History, X } from 'lucide-svelte';

	interface Props {
		value: string;
		/** Called with the new term on every change, typed or picked. */
		onSearch: (query: string) => void;
		/** Namespace for the stored history, e.g. `catalog:42`. */
		storageKey: string;
		placeholder?: string;
		id?: string;
		tourId?: string;
		ariaLabel?: string;
		/** Shows a spinner while results for the current term are loading. */
		busy?: boolean;
	}

	let {
		value = $bindable(''),
		onSearch,
		storageKey,
		placeholder = 'Search…',
		id = 'search',
		tourId,
		ariaLabel = 'Search',
		busy = false
	}: Props = $props();

	const MAX_RECENT = 8;
	/** A term is worth remembering once the user has stopped on it this long. */
	const SETTLE_MS = 1500;
	const MIN_LENGTH = 2;

	const recentKey = $derived(`chtm_recent_searches:${storageKey}`);
	const currentKey = $derived(`chtm_current_search:${storageKey}`);

	let recent = $state<string[]>([]);
	let open = $state(false);
	let highlighted = $state(-1);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let restored = false;

	// Storage can be unavailable (private mode, blocked site data): the box
	// must still work as a plain search field.
	function read(storage: Storage | undefined, key: string): string | null {
		try {
			return storage?.getItem(key) ?? null;
		} catch {
			return null;
		}
	}

	function write(storage: Storage | undefined, key: string, data: string | null): void {
		try {
			if (data === null) storage?.removeItem(key);
			else storage?.setItem(key, data);
		} catch {
			// Nothing to do: history is a convenience.
		}
	}

	onMount(() => {
		try {
			const stored = JSON.parse(read(localStorage, recentKey) ?? '[]');
			if (Array.isArray(stored)) recent = stored.filter((t) => typeof t === 'string').slice(0, MAX_RECENT);
		} catch {
			recent = [];
		}

		// Coming back to the page: pick up where the user left off.
		const last = read(sessionStorage, currentKey);
		restored = true;
		if (last && !value) {
			value = last;
			onSearch(last);
		}

		return () => clearTimeout(settleTimer);
	});

	// Keep the stored term in step with the box, including when the page
	// clears it from outside (a "Clear filters" button).
	$effect(() => {
		const term = value;
		if (!browser || !restored) return;
		untrack(() => write(sessionStorage, currentKey, term.trim() ? term : null));
	});

	function remember(term: string): void {
		const clean = term.trim();
		if (clean.length < MIN_LENGTH) return;
		recent = [clean, ...recent.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
		write(localStorage, recentKey, JSON.stringify(recent));
	}

	function forget(term: string): void {
		recent = recent.filter((t) => t !== term);
		write(localStorage, recentKey, JSON.stringify(recent));
	}

	function forgetAll(): void {
		recent = [];
		write(localStorage, recentKey, null);
		open = false;
	}

	const suggestions = $derived.by(() => {
		const q = value.trim().toLowerCase();
		return recent.filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q)));
	});
	const showList = $derived(open && suggestions.length > 0);

	function handleInput(next: string): void {
		value = next;
		highlighted = -1;
		open = true;
		onSearch(next);
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => remember(next), SETTLE_MS);
	}

	function pick(term: string): void {
		clearTimeout(settleTimer);
		value = term;
		open = false;
		highlighted = -1;
		remember(term);
		onSearch(term);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			open = false;
			return;
		}
		if (event.key === 'Enter') {
			if (showList && highlighted >= 0) {
				event.preventDefault();
				pick(suggestions[highlighted]);
			} else {
				clearTimeout(settleTimer);
				remember(value);
				open = false;
			}
			return;
		}
		if (!suggestions.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			open = true;
			highlighted = (highlighted + 1) % suggestions.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			open = true;
			highlighted = highlighted <= 0 ? suggestions.length - 1 : highlighted - 1;
		}
	}

	function handleBlur(event: FocusEvent): void {
		// Focus moving into the list (a click on a suggestion) keeps it open.
		const next = event.relatedTarget as HTMLElement | null;
		if (next?.closest(`[data-search-history="${id}"]`)) return;
		open = false;
		clearTimeout(settleTimer);
		remember(value);
	}
</script>

<input
	type="text"
	{id}
	data-tour={tourId}
	{value}
	oninput={(e) => handleInput(e.currentTarget.value)}
	onfocus={() => (open = true)}
	onblur={handleBlur}
	onkeydown={handleKeydown}
	{placeholder}
	autocomplete="off"
	role="combobox"
	aria-label={ariaLabel}
	aria-busy={busy}
	aria-expanded={showList}
	aria-controls="{id}-history"
	aria-autocomplete="list"
	aria-activedescendant={showList && highlighted >= 0 ? `${id}-history-${highlighted}` : undefined}
	class="block w-full rounded-lg border border-gray-300 py-2 pr-9 pl-9 text-sm focus:border-pink-500 focus:ring-pink-500"
/>
{#if busy}
	<!-- Shown from the first keystroke until the matching items arrive -->
	<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3" aria-hidden="true">
		<span class="h-4 w-4 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"></span>
	</div>
{/if}

{#if showList}
	<div
		data-search-history={id}
		class="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
	>
		<p class="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">Recent searches</p>
		<ul id="{id}-history" role="listbox" aria-label="Recent searches">
			{#each suggestions as term, i (term)}
				<li
					id="{id}-history-{i}"
					role="option"
					aria-selected={highlighted === i}
					class="flex items-center {highlighted === i ? 'bg-pink-50' : 'hover:bg-gray-50'}"
				>
					<button
						type="button"
						tabindex="-1"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => pick(term)}
						class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-gray-800"
					>
						<History size={14} class="shrink-0 text-gray-400" aria-hidden="true" />
						<span class="truncate">{term}</span>
					</button>
					<button
						type="button"
						tabindex="-1"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => forget(term)}
						class="mr-1 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
						aria-label="Remove {term} from recent searches"
					>
						<X size={14} />
					</button>
				</li>
			{/each}
		</ul>
		<button
			type="button"
			tabindex="-1"
			onmousedown={(e) => e.preventDefault()}
			onclick={forgetAll}
			class="w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
		>
			Clear recent searches
		</button>
	</div>
{/if}
