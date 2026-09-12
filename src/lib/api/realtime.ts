import { browser } from '$app/environment';

/**
 * Shared realtime hub.
 *
 * Every page that wants live updates subscribes here rather than opening its own
 * EventSource. One connection is multiplexed across all topics, because each
 * open stream ties up a PHP-FPM worker for its lifetime — a page watching three
 * domains used to hold three of them.
 *
 * Two guarantees callers can rely on:
 *
 *  1. Subscribers fire on every (re)connect, not only on change events. That is
 *     what makes reconnect gaps harmless: instead of replaying missed events,
 *     the client simply re-reads current state.
 *  2. If event streams cannot be held open — a single-worker dev server, or a
 *     proxy that buffers them — the hub falls back to polling a cheap signature
 *     endpoint. Callers see identical behaviour either way.
 */

export type RealtimeTopic =
	| 'borrow_request_change'
	| 'inventory_change'
	| 'donation_change'
	| 'replacement_obligation_change'
	| 'class_code_change'
	| 'notification_change'
	| 'user_change'
	| 'support_change';

const ALL_TOPICS: RealtimeTopic[] = [
	'borrow_request_change',
	'inventory_change',
	'donation_change',
	'replacement_obligation_change',
	'class_code_change',
	'notification_change',
	'user_change',
	'support_change'
];

/**
 * Why a subscriber was invoked.
 *
 * `change`  — the server reported this topic actually moved.
 * `connect` — we (re)connected and are re-reading state defensively. Nothing is
 *             known to have changed, so this must never drive a user-visible
 *             notification; connections recycle constantly and the user would
 *             be told "updated" every time.
 */
export type RealtimeReason = 'change' | 'connect';

type Listener = (reason: RealtimeReason) => void;

/** A stream closing sooner than this suggests it cannot be held open at all. */
const QUICK_CLOSE_MS = 5_000;

/** Quick closes tolerated before giving up on SSE for this session. */
const QUICK_CLOSE_LIMIT = 3;

/** Signature poll interval once SSE has been ruled out. */
const FALLBACK_POLL_MS = 5_000;

const listeners = new Map<RealtimeTopic, Set<Listener>>();

let source: EventSource | null = null;
let connectedAt = 0;
let quickCloses = 0;
let usePolling = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSignatures: Record<string, string> = {};
let visibilityBound = false;

function notify(topic: RealtimeTopic, reason: RealtimeReason): void {
	const subscribers = listeners.get(topic);
	if (!subscribers) return;

	for (const listener of subscribers) {
		try {
			listener(reason);
		} catch (error) {
			console.error(`[REALTIME] subscriber for ${topic} threw`, error);
		}
	}
}

/** Wake every subscriber — used on (re)connect so nobody shows stale data. */
function notifyAll(): void {
	for (const topic of listeners.keys()) {
		notify(topic, 'connect');
	}
}

function hasSubscribers(): boolean {
	for (const set of listeners.values()) {
		if (set.size > 0) return true;
	}
	return false;
}

function openStream(): void {
	if (!browser || source || usePolling) return;

	source = new EventSource('/api/stream', { withCredentials: true });
	connectedAt = 0;

	source.addEventListener('connected', () => {
		connectedAt = Date.now();
		quickCloses = 0;
		// Re-read current state; anything missed while disconnected is covered.
		notifyAll();
	});

	for (const topic of ALL_TOPICS) {
		source.addEventListener(topic, () => notify(topic, 'change'));
	}

	source.addEventListener('error', () => {
		const lived = connectedAt ? Date.now() - connectedAt : 0;

		// A stream that dies immediately, repeatedly, is not going to work here.
		if (connectedAt === 0 || lived < QUICK_CLOSE_MS) {
			quickCloses += 1;
		}

		if (quickCloses >= QUICK_CLOSE_LIMIT) {
			console.info('[REALTIME] event stream unavailable, falling back to signature polling');
			closeStream();
			usePolling = true;
			startPolling();
		}
		// Otherwise EventSource reconnects on its own; `connected` will refetch.
	});
}

function closeStream(): void {
	source?.close();
	source = null;
	connectedAt = 0;
}

async function pollSignatures(): Promise<void> {
	if (!browser) return;
	if (document.visibilityState === 'hidden') return;

	try {
		const response = await fetch('/api/stream/signature', { credentials: 'include' });
		if (!response.ok) return;

		const payload = (await response.json()) as { signatures?: Record<string, string> };
		const next = payload.signatures ?? {};
		const first = Object.keys(lastSignatures).length === 0;

		for (const [topic, signature] of Object.entries(next)) {
			if (!first && lastSignatures[topic] !== signature) {
				notify(topic as RealtimeTopic, 'change');
			}
		}

		lastSignatures = next;
	} catch {
		// Offline or mid-deploy; the next tick retries.
	}
}

function startPolling(): void {
	if (!browser || pollTimer) return;

	lastSignatures = {};
	void pollSignatures().then(notifyAll);
	pollTimer = setInterval(() => void pollSignatures(), FALLBACK_POLL_MS);
}

function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	lastSignatures = {};
}

function bindVisibility(): void {
	if (!browser || visibilityBound) return;
	visibilityBound = true;

	// Coming back to the tab is the moment stale data is most visible.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState !== 'visible' || !hasSubscribers()) return;

		if (usePolling) {
			void pollSignatures();
		} else if (!source) {
			openStream();
		}
		notifyAll();
	});
}

function connect(): void {
	bindVisibility();

	if (usePolling) {
		startPolling();
	} else {
		openStream();
	}
}

function disconnectIfIdle(): void {
	if (hasSubscribers()) return;
	closeStream();
	stopPolling();
}

/**
 * Subscribe to a realtime topic.
 *
 * `callback` fires when the topic changes AND on every (re)connect, so treat it
 * as "refetch now" rather than "apply this delta". Returns an unsubscribe
 * function — call it from `onDestroy`.
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
