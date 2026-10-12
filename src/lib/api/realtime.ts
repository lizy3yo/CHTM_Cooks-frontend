import { browser } from '$app/environment';

/**
 * Shared realtime hub.
 *
 * Every page that wants live updates subscribes here rather than opening its own
 * EventSource. One connection is multiplexed across all topics, because each
 * open stream ties up a PHP-FPM worker for its lifetime — a page watching three
 * domains used to hold three of them.
 *
 * How it stays correct without replaying events:
 *
 *  1. The server sends the current fingerprint of every topic whenever the
 *     stream (re)connects. The hub keeps the last fingerprint it saw, so after
 *     a gap it knows exactly which topics moved and wakes only those. A
 *     reconnect with nothing changed costs no refetch at all.
 *  2. The hub runs for the whole signed-in session (`startRealtime`), not only
 *     while a page is subscribed. Client caches register with `onTopicChange`
 *     and are marked stale the moment their topic moves, so a page the user is
 *     not looking at is still correct when they come back to it.
 *  3. If event streams cannot be held open — a single-worker dev server, a
 *     proxy that buffers them, or a server whose stream budget is spent — the
 *     hub polls a cheap signature endpoint instead. Callers see identical
 *     behaviour either way.
 */

export type RealtimeTopic =
	| 'borrow_request_change'
	| 'inventory_change'
	| 'donation_change'
	| 'replacement_obligation_change'
	| 'class_code_change'
	| 'notification_change'
	| 'user_change'
	| 'support_change'
	| 'walk_in_change';

const ALL_TOPICS: RealtimeTopic[] = [
	'borrow_request_change',
	'inventory_change',
	'donation_change',
	'replacement_obligation_change',
	'class_code_change',
	'notification_change',
	'user_change',
	'support_change',
	'walk_in_change'
];

/**
 * Why a subscriber was invoked.
 *
 * `change`  — the server reported this topic actually moved.
 * `connect` — the hub has no baseline to compare against (first connection of
 *             the session, or a server that does not send fingerprints) and is
 *             re-reading state defensively. Nothing is known to have changed,
 *             so this must never drive a user-visible notification.
 */
export type RealtimeReason = 'change' | 'connect';

type Listener = (reason: RealtimeReason) => void;

/** What the server reports on connect and on every signature poll. */
interface Snapshot {
	signatures?: Record<string, string>;
	/** Topics written in the same second as our previous read. */
	recent?: string[];
	/** Server time of this read; echoed back so the server can compute `recent`. */
	at?: number;
	/** False when the server will not keep this stream open. */
	hold?: boolean;
}

/** A stream closing sooner than this suggests it cannot be held open at all. */
const QUICK_CLOSE_MS = 5_000;

/** Quick closes tolerated before giving up on SSE for this session. */
const QUICK_CLOSE_LIMIT = 3;

/** Signature poll interval once SSE has been ruled out. */
const FALLBACK_POLL_MS = 4_000;

/** Delay before reopening a stream the browser has given up on. */
const REOPEN_DELAY_MS = 3_000;

const listeners = new Map<RealtimeTopic, Set<Listener>>();
const cacheHooks = new Map<RealtimeTopic, Set<Listener>>();

let source: EventSource | null = null;
let connectedAt = 0;
let quickCloses = 0;
let usePolling = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reopenTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let sessionActive = false;
let lifecycleBound = false;

/** Last fingerprint seen per topic; null until the first snapshot arrives. */
let baseline: Record<string, string> | null = null;
let lastReadAt: number | null = null;

function run(set: Set<Listener> | undefined, topic: RealtimeTopic, reason: RealtimeReason): void {
	if (!set) return;

	for (const listener of [...set]) {
		try {
			listener(reason);
		} catch (error) {
			console.error(`[REALTIME] subscriber for ${topic} threw`, error);
		}
	}
}

function notify(topic: RealtimeTopic, reason: RealtimeReason): void {
	// Caches first: by the time a page reacts and asks for data, the cache
	// already knows its copy is out of date.
	run(cacheHooks.get(topic), topic, reason);
	run(listeners.get(topic), topic, reason);
}

/** Wake everything — only when there is no baseline to tell what changed. */
function notifyAll(): void {
	for (const topic of ALL_TOPICS) {
		notify(topic, 'connect');
	}
}

function hasSubscribers(): boolean {
	for (const set of listeners.values()) {
		if (set.size > 0) return true;
	}
	return false;
}

function wanted(): boolean {
	return sessionActive || hasSubscribers();
}

function isTopic(value: string): value is RealtimeTopic {
	return (ALL_TOPICS as string[]).includes(value);
}

/**
 * Compare a server snapshot with the baseline and wake exactly the topics
 * that moved.
 */
function applySnapshot(snapshot: Snapshot): void {
	const next = snapshot.signatures;

	// An older server sends no fingerprints; fall back to re-reading everything.
	if (!next || Object.keys(next).length === 0) {
		notifyAll();
		return;
	}

	const previous = baseline;
	const recent = new Set(snapshot.recent ?? []);

	baseline = { ...next };
	if (typeof snapshot.at === 'number') lastReadAt = snapshot.at;

	if (!previous) {
		notifyAll();
		return;
	}

	for (const [topic, signature] of Object.entries(next)) {
		if (!isTopic(topic)) continue;
		if (previous[topic] !== signature || recent.has(topic)) {
			notify(topic, 'change');
		}
	}
}

function parse<T>(raw: unknown): T | null {
	if (typeof raw !== 'string' || raw === '') return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function switchToPolling(): void {
	closeStream();
	usePolling = true;
	startPolling();
}

function openStream(): void {
	if (!browser || source || usePolling || !wanted()) return;

	const stream = new EventSource('/api/stream', { withCredentials: true });
	source = stream;
	connectedAt = 0;

	stream.addEventListener('connected', (event) => {
		connectedAt = Date.now();
		// quickCloses is NOT reset here: a stream that connects and then drops
		// at once must still count, or it reconnects forever instead of
		// falling back to polling.
		const snapshot = parse<Snapshot>((event as MessageEvent).data) ?? {};
		applySnapshot(snapshot);

		if (snapshot.hold === false) {
			// The server answered but will not keep the stream open.
			switchToPolling();
		}
	});

	for (const topic of ALL_TOPICS) {
		stream.addEventListener(topic, (event) => {
			const message = event as MessageEvent;
			const signature = parse<{ signature?: string }>(message.data)?.signature;

			if (signature && baseline) baseline[topic] = signature;

			const at = Number(message.lastEventId);
			if (Number.isFinite(at) && at > 0) lastReadAt = at;

			notify(topic, 'change');
		});
	}

	stream.addEventListener('error', () => {
		const lived = connectedAt ? Date.now() - connectedAt : 0;

		// A stream that dies immediately, repeatedly, is not going to work here.
		// One that stayed up proves SSE works, so the count starts over.
		if (connectedAt === 0 || lived < QUICK_CLOSE_MS) {
			quickCloses += 1;
		} else {
			quickCloses = 0;
		}
		connectedAt = 0;

		if (quickCloses >= QUICK_CLOSE_LIMIT) {
			console.info('[REALTIME] event stream unavailable, falling back to signature polling');
			switchToPolling();
			return;
		}

		// The browser retries on its own after a dropped connection, but gives
		// up for good on an HTTP error. Reopen it ourselves in that case.
		if (stream.readyState === EventSource.CLOSED) {
			closeStream();
			scheduleReopen();
		}
	});
}

function scheduleReopen(): void {
	if (reopenTimer || !browser) return;

	reopenTimer = setTimeout(() => {
		reopenTimer = null;
		if (wanted() && !usePolling) openStream();
	}, REOPEN_DELAY_MS);
}

function closeStream(): void {
	source?.close();
	source = null;
	connectedAt = 0;

	if (reopenTimer) {
		clearTimeout(reopenTimer);
		reopenTimer = null;
	}
}

async function pollSignatures(): Promise<void> {
	if (!browser || pollInFlight) return;
	if (document.visibilityState === 'hidden') return;

	pollInFlight = true;
	try {
		const query = lastReadAt ? `?after=${lastReadAt}` : '';
		const response = await fetch(`/api/stream/signature${query}`, {
			credentials: 'include',
			cache: 'no-store'
		});
		if (!response.ok) return;

		applySnapshot((await response.json()) as Snapshot);
	} catch {
		// Offline or mid-deploy; the next tick retries.
	} finally {
		pollInFlight = false;
	}
}

function startPolling(): void {
	if (!browser || pollTimer) return;

	void pollSignatures();
	pollTimer = setInterval(() => void pollSignatures(), FALLBACK_POLL_MS);
}

function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

/** Catch up at once when the tab or the network comes back. */
function resume(): void {
	if (!wanted() || document.visibilityState !== 'visible') return;

	if (usePolling) {
		void pollSignatures();
	} else if (!source) {
		openStream();
	}
	// An open stream needs nothing: it kept receiving while in the background,
	// and a dropped one resyncs from the fingerprints on reconnect.
}

function bindLifecycle(): void {
	if (!browser || lifecycleBound) return;
	lifecycleBound = true;

	document.addEventListener('visibilitychange', resume);
	window.addEventListener('online', resume);
}

function connect(): void {
	bindLifecycle();

	if (usePolling) {
		startPolling();
	} else {
		openStream();
	}
}

function disconnectIfIdle(): void {
	if (wanted()) return;

	closeStream();
	stopPolling();
	// With nothing listening, changes go unseen; the next connection must not
	// trust this baseline.
	baseline = null;
	lastReadAt = null;
}

/**
 * Keep the hub connected for the signed-in session, whether or not a page is
 * subscribed. This is what lets cached data be trusted across navigation.
 */
export function startRealtime(): void {
	if (!browser || sessionActive) return;

	sessionActive = true;
	connect();
}

/** Drop the session connection — on sign-out, before caches are cleared. */
export function stopRealtime(): void {
	if (!browser) return;

	sessionActive = false;
	quickCloses = 0;
	disconnectIfIdle();
}

/**
 * Subscribe to a realtime topic.
 *
 * `callback` fires when the topic changes, and with reason `connect` when the
 * hub cannot tell what changed, so treat it as "refetch now" rather than
 * "apply this delta". Returns an unsubscribe function — call it from
 * `onDestroy`.
 */
export function subscribeToTopic(topic: RealtimeTopic, callback: Listener): () => void {
	if (!browser) return () => {};

	let set = listeners.get(topic);
	if (!set) {
		set = new Set();
		listeners.set(topic, set);
	}
	set.add(callback);

	connect();

	return () => {
		set?.delete(callback);
		disconnectIfIdle();
	};
}

/** Subscribe to several topics at once; one unsubscribe covers them all. */
export function subscribeToTopics(topics: RealtimeTopic[], callback: Listener): () => void {
	const unsubscribes = topics.map((topic) => subscribeToTopic(topic, callback));
	return () => unsubscribes.forEach((fn) => fn());
}

/**
 * Register a cache against the topics that can invalidate it.
 *
 * Unlike a page subscription this never opens a connection by itself and is
 * never removed: it is for module-level caches, which outlive every page. The
 * hook runs before page subscribers, so a page that refetches in response to
 * the same event always gets data read after the change.
 */
export function onTopicChange(topics: RealtimeTopic[], hook: Listener): void {
	if (!browser) return;

	for (const topic of topics) {
		let set = cacheHooks.get(topic);
		if (!set) {
			set = new Set();
			cacheHooks.set(topic, set);
		}
		set.add(hook);
	}
}
