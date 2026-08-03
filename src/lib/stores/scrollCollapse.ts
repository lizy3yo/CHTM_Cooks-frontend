/**
 * Scroll-aware collapse state for the floating widgets (the AI chatbot FAB and
 * the PWA install prompt).
 *
 * `fabCollapsed` is true while the user scrolls the page DOWN — the widgets then
 * tuck themselves into a small "arrow" tab at the screen edge so they don't cover
 * content. Scrolling UP (or near the top of the page) expands them again. Tapping
 * a widget's arrow also expands it: it just sets this false until the next
 * downward scroll re-collapses it.
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const fabCollapsed = writable(false);

let listening = false;
let lastY = 0;

const TOP_ZONE = 40; // always expanded near the very top of the page
const DELTA = 8; // ignore tiny/jitter scrolls

/**
 * Start the global scroll watcher. Returns a cleanup function. Safe to call once
 * (subsequent calls while already listening are no-ops). SSR-safe.
 */
export function initScrollCollapse(): () => void {
	if (!browser || listening) return () => {};
	listening = true;
	lastY = window.scrollY;
	let ticking = false;

	const onScroll = () => {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			ticking = false;
			const y = window.scrollY;
			if (y < TOP_ZONE) {
				fabCollapsed.set(false);
			} else if (y - lastY > DELTA) {
				fabCollapsed.set(true); // scrolling down
			} else if (lastY - y > DELTA) {
				fabCollapsed.set(false); // scrolling up
			}
			lastY = y;
		});
	};

	window.addEventListener('scroll', onScroll, { passive: true });
	return () => {
		window.removeEventListener('scroll', onScroll);
		listening = false;
	};
}
