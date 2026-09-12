/**
 * Incremental list syncing.
 *
 * A page that already holds a list does not need it resent because one row
 * changed. This asks the server only for rows touched since the last sync and
 * merges them into what the page already has, so a single approval costs one
 * record instead of the whole collection — and Svelte's keyed blocks redraw
 * only the row that actually moved.
 *
 * Safe here because the request and inventory pages fetch their entire list and
 * filter, sort and paginate client-side. A merged row therefore lands in the
 * right place on its own, which would not hold if the server were paginating.
 *
 * Whenever a delta cannot be trusted, this falls back to a full read — the
 * worst case is exactly today's behaviour, never stale or wrong data.
 */

export interface DeltaPage<TRecord> {
	/** Rows in this response: everything on a full read, only changes on a delta. */
	items: TRecord[];
	/** Count of ALL visible rows, never just the changed ones. */
	total: number;
	/** Server clock at the moment of the read; the next watermark. */
	syncedAt?: string;
}

export interface DeltaSyncOptions<TRecord> {
	/** Stable identity for a row, used to merge and de-duplicate. */
	idOf: (record: TRecord) => string;
	/** Read everything the caller can see. */
	fetchAll: () => Promise<DeltaPage<TRecord>>;
	/** Read only rows touched at or after `since`. */
	fetchSince: (since: string) => Promise<DeltaPage<TRecord>>;
}

export interface DeltaResult<TRecord> {
	records: TRecord[];
	/** How the data was obtained — useful for logging and tests. */
	mode: 'full' | 'delta' | 'unchanged';
	/** Rows the server actually sent this round. */
	changed: number;
}

export class DeltaSync<TRecord> {
	private watermark: string | null = null;
	private knownTotal = 0;

	constructor(private readonly options: DeltaSyncOptions<TRecord>) {}

	/** Drop all state so the next sync reads everything. Use after filters change. */
	reset(): void {
		this.watermark = null;
		this.knownTotal = 0;
	}

	/** True once a baseline exists, i.e. the next sync can be incremental. */
	get primed(): boolean {
		return this.watermark !== null;
	}

	/**
	 * Bring `current` up to date, returning the records to render.
	 *
	 * Pass the list the page is holding now; the result is either that same
	 * array (nothing changed), a merged copy, or a fresh full read.
	 */
	async sync(current: TRecord[]): Promise<DeltaResult<TRecord>> {
		if (!this.watermark) {
			return this.full();
		}

		let page: DeltaPage<TRecord>;
		try {
			page = await this.options.fetchSince(this.watermark);
		} catch (error) {
			// A failed delta must not leave the page stale; take the safe path.
			console.warn('[DELTA-SYNC] delta read failed, falling back to full read', error);
			return this.full();
		}

		// A `since` query cannot express deletion — a removed row is simply
		// absent. A shrinking total is the only signal that one went away.
		if (page.total < this.knownTotal) {
			return this.full();
		}

		this.knownTotal = page.total;
		this.watermark = page.syncedAt ?? new Date().toISOString();

		if (page.items.length === 0) {
			return { records: current, mode: 'unchanged', changed: 0 };
		}

		const byId = new Map(current.map((record) => [this.options.idOf(record), record]));
		for (const record of page.items) {
			byId.set(this.options.idOf(record), record);
		}

		return { records: [...byId.values()], mode: 'delta', changed: page.items.length };
	}

	private async full(): Promise<DeltaResult<TRecord>> {
		const page = await this.options.fetchAll();

		this.knownTotal = page.total;
		this.watermark = page.syncedAt ?? new Date().toISOString();

		return { records: page.items, mode: 'full', changed: page.items.length };
	}
}
