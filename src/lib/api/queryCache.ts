import { browser } from '$app/environment';
import { onTopicChange, type RealtimeTopic } from './realtime';

/**
 * Stale-while-revalidate cache for API reads.
 *
 * Every API module used to keep its own Map with its own expiry rules, and
 * "invalidate" meant "delete". Deleting is what made the app feel slow: any
 * change anywhere emptied the cache, so going back to a page showed a skeleton
 * and reloaded everything.
 *
 * Here an entry is never thrown away because it is out of date — it is marked
 * stale. That separates two questions the old caches conflated:
 *
 *  - "Do I have something to show?"  → `peek()`. Answers instantly, even when
 *    stale, so a revisited page paints at once.
 *  - "Is what I have current?"       → `fetch()`. Returns the cached value
 *    without touching the network while it is fresh, and revalidates when not.
 *
 * Freshness comes from the realtime hub rather than from a short timer: a cache
 * names the topics that can change its data and is marked stale the moment one
 * of them moves, whether or not a page is watching. `staleAfterMs` is only a
 * backstop for changes the hub cannot see.
 */

interface Entry<T> {
	data: T;
	fetchedAt: number;
	stale: boolean;
}

export interface QueryCacheOptions {
	/** Realtime topics whose changes make this cache's data out of date. */
	topics?: RealtimeTopic[];
	/** Age after which an entry is revalidated even with no change reported. */
	staleAfterMs?: number;
	/** Oldest entries are dropped beyond this many keys. */
	maxEntries?: number;
	/** Runs whenever entries are marked stale or cleared. */
	onStale?: () => void;
}

export interface FetchOptions {
	/** Skip the cache and read from the server. */
	force?: boolean;
}

const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

/** Entries newer than this survive a realtime (re)connect with no baseline. */
const CONNECT_GRACE_MS = 15_000;

const registry = new Set<QueryCache<unknown>>();

export class QueryCache<T> {
	private readonly entries = new Map<string, Entry<T>>();
	private readonly inFlight = new Map<string, Promise<T>>();
	private readonly staleAfterMs: number;
	private readonly maxEntries: number;
	private readonly onStale?: () => void;

	/**
	 * Reads that missed and are presumably being fetched, with the epoch they
	 * started in. Lets `set()` recognise a response that predates a change.
	 */
	private readonly openReads = new Map<string, number>();

	/**
	 * Bumped whenever the data may have changed underneath a request already
	 * in flight, so its response is not mistaken for current.
	 */
	private epoch = 0;

	/** Bumped on `clear()`; a response from before it is discarded outright. */
	private generation = 0;

	constructor(options: QueryCacheOptions = {}) {
		this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
		this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.onStale = options.onStale;

		registry.add(this as QueryCache<unknown>);

		if (options.topics?.length) {
			onTopicChange(options.topics, (reason) => {
				if (reason === 'change') {
					this.markStale();
				} else {
					// The hub connected with nothing to compare against. What
					// was read moments ago is as current as anything a refetch
					// would return; only older entries are in doubt.
					this.markStaleOlderThan(CONNECT_GRACE_MS);
				}
			});
		}
	}

	/** The last known value, stale or not. Never touches the network. */
	peek(key: string): T | null {
		if (!browser) return null;
		return this.entries.get(key)?.data ?? null;
	}

	/** The cached value only if it can be trusted as current. */
	getFresh(key: string): T | null {
		if (!browser) return null;

		const entry = this.entries.get(key);
		const fresh =
			!!entry && !entry.stale && Date.now() - entry.fetchedAt <= this.staleAfterMs;

		if (!fresh) {
			// The caller is about to read from the server; remember when.
			if (!this.openReads.has(key)) this.openReads.set(key, this.epoch);
			return null;
		}

		return entry.data;
	}

	/** Like `getFresh`, but a pure check: it does not anticipate a fetch. */
	isFresh(key: string): boolean {
		const entry = this.entries.get(key);
		return !!entry && !entry.stale && Date.now() - entry.fetchedAt <= this.staleAfterMs;
	}

	/**
	 * Store a value just read from the server. If the data changed after the
	 * read began, the value is kept to show but is not vouched for.
	 */
	set(key: string, data: T): void {
		if (!browser) return;

		const startedIn = this.openReads.get(key);
		this.openReads.delete(key);
		const stale = startedIn !== undefined && startedIn !== this.epoch;

		// Re-insert so iteration order tracks recency for eviction.
		this.entries.delete(key);
		this.entries.set(key, { data, fetchedAt: Date.now(), stale });

		if (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value;
			if (oldest !== undefined) this.entries.delete(oldest);
		}
	}

	/**
	 * Apply a local change to a cached value without altering its freshness —
	 * e.g. swapping in the record a mutation just returned.
	 */
	update(key: string, updater: (current: T) => T): void {
		const entry = this.entries.get(key);
		if (entry) entry.data = updater(entry.data);
	}

	/** Apply a local change to every cached value. */
	updateAll(updater: (current: T, key: string) => T): void {
		for (const [key, entry] of this.entries) {
			entry.data = updater(entry.data, key);
		}
	}

	/**
	 * Flag entries as out of date. They stay available to `peek()`; the next
	 * `fetch()` reads from the server.
	 */
	markStale(key?: string): void {
		this.epoch += 1;
		this.onStale?.();

		if (key !== undefined) {
			const entry = this.entries.get(key);
			if (entry) entry.stale = true;
			this.inFlight.delete(key);
			return;
		}

		for (const entry of this.entries.values()) {
			entry.stale = true;
		}
		// A request already under way may predate the change. Its own callers
		// still get its result, but nobody new is handed it.
		this.inFlight.clear();
	}

	/** Flag only the entries read more than `ageMs` ago. */
	markStaleOlderThan(ageMs: number): void {
		const cutoff = Date.now() - ageMs;
		let marked = false;

		for (const entry of this.entries.values()) {
			if (!entry.stale && entry.fetchedAt < cutoff) {
				entry.stale = true;
				marked = true;
			}
		}

		if (marked) {
			this.epoch += 1;
			this.onStale?.();
			this.inFlight.clear();
		}
	}

	delete(key: string): void {
		this.entries.delete(key);
		this.inFlight.delete(key);
	}

	/** Forget everything — used when the signed-in user changes. */
	clear(): void {
		this.generation += 1;
		this.epoch += 1;
		this.entries.clear();
		this.inFlight.clear();
		this.openReads.clear();
		this.onStale?.();
	}

	/**
	 * Return the cached value when fresh; otherwise run `loader`, sharing one
	 * request between concurrent callers.
	 */
	async fetch(key: string, loader: () => Promise<T>, options: FetchOptions = {}): Promise<T> {
		if (!browser) return loader();

		if (!options.force) {
			const fresh = this.getFresh(key);
			if (fresh !== null) return fresh;

			const pending = this.inFlight.get(key);
			if (pending) return pending;
		}

		const epoch = this.epoch;
		const generation = this.generation;

		const request = (async () => {
			const data = await loader();

			// A response from before `clear()` belongs to a previous session.
			if (generation === this.generation) {
				this.openReads.delete(key);
				this.set(key, data);

				// Something changed while this was in flight: keep the value to
				// show, but do not vouch for it.
				if (epoch !== this.epoch) {
					const entry = this.entries.get(key);
					if (entry) entry.stale = true;
				}
			}

			return data;
		})();

		this.inFlight.set(key, request);
		try {
			return await request;
		} finally {
			if (this.inFlight.get(key) === request) this.inFlight.delete(key);
		}
	}
}

/**
 * Empty every cache. Called on sign-out and sign-in so nothing fetched for one
 * account can be shown to the next.
 */
export function clearAllQueryCaches(): void {
	for (const cache of registry) {
		cache.clear();
	}
}

/** Flag every cache as out of date without discarding what it holds. */
export function markAllQueryCachesStale(): void {
	for (const cache of registry) {
		cache.markStale();
	}
}
