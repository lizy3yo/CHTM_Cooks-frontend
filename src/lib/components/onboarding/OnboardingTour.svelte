<script lang="ts">
	import { tick } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { TourStep } from './tourSteps';

	interface Props {
		steps: TourStep[];
		open: boolean;
		/** Called when the user finishes the last step OR skips the tour. */
		onDone: () => void;
	}

	let { steps, open, onDone }: Props = $props();

	type RectLike = {
		top: number;
		left: number;
		width: number;
		height: number;
		right: number;
		bottom: number;
	};

	let index = $state(0);
	let targetRect = $state<RectLike | null>(null);
	let currentEl: HTMLElement | null = null; // resolved element for the active step
	let refreshToken = 0; // invalidates in-flight async refreshes when the step changes
	let cardEl = $state<HTMLDivElement | null>(null);
	let cardPos = $state<{ top: number; left: number; placement: string }>({
		top: 0,
		left: 0,
		placement: 'center'
	});

	const PAD = 6; // spotlight breathing room around the target
	const GAP = 14; // distance between target and tooltip
	const MARGIN = 12; // keep the card this far from viewport edges

	const current = $derived(steps[index]);
	const isFirst = $derived(index === 0);
	const isLast = $derived(index === steps.length - 1);

	/**
	 * Among all elements matching the selector (the same link exists in both the
	 * desktop sidebar and the mobile bottom nav), return the one that is actually
	 * on-screen right now. The off-screen copy is translated out of the viewport
	 * or `display:none`, so it is filtered out.
	 */
	function resolveVisible(selector: string): HTMLElement | null {
		const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
		let firstRendered: HTMLElement | null = null;
		for (const el of els) {
			const r = el.getBoundingClientRect();
			if (r.width < 1 || r.height < 1) continue;
			if (!firstRendered) firstRendered = el;
			const onScreen =
				r.left >= 0 &&
				r.top >= 0 &&
				r.right <= window.innerWidth + 1 &&
				r.bottom <= window.innerHeight + 1;
			if (onScreen) return el;
		}
		// No on-screen match: fall back to the first rendered element (it may be
		// off-screen, e.g. a review section below the fold — the caller scrolls it
		// into view). Keeps duplicate-disambiguation for nav links (on-screen wins).
		return firstRendered;
	}

	function computePos(
		placement: string,
		rect: RectLike,
		cw: number,
		ch: number
	): { top: number; left: number } {
		switch (placement) {
			case 'right':
				return { left: rect.right + GAP, top: rect.top + rect.height / 2 - ch / 2 };
			case 'left':
				return { left: rect.left - GAP - cw, top: rect.top + rect.height / 2 - ch / 2 };
			case 'top':
				return { left: rect.left + rect.width / 2 - cw / 2, top: rect.top - GAP - ch };
			case 'bottom':
			default:
				return { left: rect.left + rect.width / 2 - cw / 2, top: rect.bottom + GAP };
		}
	}

	function fits(pos: { top: number; left: number }, cw: number, ch: number): boolean {
		return (
			pos.left >= MARGIN &&
			pos.left + cw <= window.innerWidth - MARGIN &&
			pos.top >= MARGIN &&
			pos.top + ch <= window.innerHeight - MARGIN
		);
	}

	function positionCard(rect: RectLike | null, preferred?: string): void {
		const cw = cardEl?.offsetWidth ?? 320;
		const ch = cardEl?.offsetHeight ?? 190;
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// Pinned to a corner: keep the card out of the way of any popover the
		// highlighted field opens (date calendar, time/select dropdown).
		const pin = steps[index]?.pin;
		if (pin && rect) {
			cardPos = {
				left: pin.includes('r') ? vw - cw - MARGIN : MARGIN,
				top: pin.includes('b') ? vh - ch - MARGIN : MARGIN,
				placement: 'pin'
			};
			return;
		}

		if (!rect) {
			cardPos = { top: (vh - ch) / 2, left: (vw - cw) / 2, placement: 'center' };
			return;
		}

		// Try the preferred side first, then sensible fallbacks, then clamp.
		const order = [preferred, 'right', 'bottom', 'top', 'left'].filter(Boolean) as string[];
		let chosen: { top: number; left: number } | null = null;
		let chosenPlacement = order[0] ?? 'bottom';
		for (const p of order) {
			const pos = computePos(p, rect, cw, ch);
			if (fits(pos, cw, ch)) {
				chosen = pos;
				chosenPlacement = p;
				break;
			}
		}
		if (!chosen) chosen = computePos(chosenPlacement, rect, cw, ch);

		cardPos = {
			left: Math.max(MARGIN, Math.min(chosen.left, vw - cw - MARGIN)),
			top: Math.max(MARGIN, Math.min(chosen.top, vh - ch - MARGIN)),
			placement: chosenPlacement
		};
	}

	/** Precise path match: exactly `route`, or a sub-path of it (avoids
	 *  "/student/request" spuriously matching "/student/requests"). */
	function matchesRoute(path: string, route: string): boolean {
		return path === route || path.startsWith(route + '/');
	}

	/** Bounding box covering both rects. */
	function unionRect(a: RectLike, b: RectLike): RectLike {
		const top = Math.min(a.top, b.top);
		const left = Math.min(a.left, b.left);
		const right = Math.max(a.right, b.right);
		const bottom = Math.max(a.bottom, b.bottom);
		return { top, left, right, bottom, width: right - left, height: bottom - top };
	}

	/** The active step's spotlight rect — the target, expanded to also cover its
	 *  `spotlightWith` element (e.g. an open calendar) when that is visible. */
	function computeSpotlightRect(): RectLike | null {
		if (!currentEl) return null;
		let rect: RectLike = currentEl.getBoundingClientRect();
		const withSel = steps[index]?.spotlightWith;
		if (withSel) {
			const extra = resolveVisible(withSel);
			if (extra) rect = unionRect(rect, extra.getBoundingClientRect());
		}
		return rect;
	}

	/** Poll for a visible element until it appears or the timeout elapses. */
	function waitForElement(
		selector: string,
		timeout: number,
		alive: () => boolean
	): Promise<HTMLElement | null> {
		return new Promise((resolve) => {
			const start = performance.now();
			const attempt = () => {
				if (!alive()) return resolve(null);
				const el = resolveVisible(selector);
				if (el) return resolve(el);
				if (performance.now() - start > timeout) return resolve(null);
				setTimeout(attempt, 100);
			};
			attempt();
		});
	}

	/**
	 * Move to the active step: navigate to its page if needed, wait for its
	 * target to render, scroll it into view, then position the spotlight + card.
	 * An incrementing token guards against a newer step superseding this one
	 * mid-navigation.
	 */
	async function refresh(): Promise<void> {
		const token = ++refreshToken;
		const step = steps[index];
		if (!step) {
			onDone();
			return;
		}

		// Navigate into the step's page when it lives somewhere else.
		if (step.route) {
			const path = get(page).url.pathname;
			if (!matchesRoute(path, step.route)) {
				// Show a centered card while the page loads (old target is gone).
				currentEl = null;
				targetRect = null;
				positionCard(null, step.placement);
				await goto(step.route);
				if (token !== refreshToken) return;
			}
		}

		// Dismiss a leftover modal so the step starts clean (e.g. Back to "open an
		// item" while the item modal is still open).
		if (step.resetSelector) {
			const closer = resolveVisible(step.resetSelector);
			if (closer) {
				closer.click();
				await tick();
			}
		}

		currentEl = null;
		let rect: DOMRect | null = null;
		if (step.target) {
			let el = resolveVisible(step.target);
			if (!el) {
				// Target isn't on screen yet (e.g. a later wizard step or a modal
				// that hasn't opened). Drop the previous spotlight immediately so we
				// never show a stale highlight under the new step's card, then wait.
				targetRect = null;
				positionCard(null, step.placement);
				el = await waitForElement(step.target, step.optional ? 1200 : 5000, () => token === refreshToken);
				if (token !== refreshToken) return;
				// Optional step whose target never rendered — skip it.
				if (!el && step.optional) {
					next();
					return;
				}
			}
			if (el) {
				el.scrollIntoView({ block: 'center', inline: 'nearest' });
				currentEl = el;
				rect = el.getBoundingClientRect();
			}
		}
		targetRect = currentEl ? computeSpotlightRect() : rect;
		// Place immediately (using the current card size) so there is never an
		// unpositioned flash, then refine after the DOM updates so the new step's
		// measured height and post-scroll position are used. tick() resolves on a
		// microtask regardless of tab visibility — unlike requestAnimationFrame,
		// which pauses when the page isn't being composited.
		positionCard(rect, step.placement);
		tick().then(() => {
			if (token === refreshToken) reposition();
		});
	}

	/** Lightweight realignment from the already-resolved element (scroll/resize). */
	function reposition(): void {
		const step = steps[index];
		if (currentEl) {
			targetRect = computeSpotlightRect();
			positionCard(targetRect, step?.placement);
		} else {
			positionCard(null, step?.placement);
		}
	}

	function next(): void {
		// The overlay is non-blocking, so the user performs the real actions
		// themselves (opening an item, clicking Continue, filling fields). Next
		// only advances the guidance — it never drives the app, which would
		// double-advance a step the user already completed.
		if (isLast) onDone();
		else index += 1;
	}

	function back(): void {
		if (!isFirst) index -= 1;
	}

	function skip(): void {
		onDone();
	}

	// Reset to the first step each time the tour opens.
	let started = $state(false);
	$effect(() => {
		if (open && !started) {
			started = true;
			index = 0;
		} else if (!open && started) {
			started = false;
		}
	});

	// Recompute spotlight + tooltip when the tour opens or the step changes.
	// Body scroll is intentionally NOT locked: steps may target elements further
	// down a page, which must be scrolled into view via scrollIntoView().
	$effect(() => {
		// track dependencies
		index;
		if (!open) return;
		refresh();
	});

	// Auto-advance: keep the tour continuous by moving on the moment the user
	// completes what a step asks for —
	//   • `advanceWhen`      → a target element appears (an item/request modal opens)
	//   • `advanceWhenRoute` → the page navigates to that route (a nav link clicked)
	// The user can still click Next manually.
	$effect(() => {
		const i = index;
		if (!open) return;
		const step = steps[i];
		if (!step?.advanceWhen && !step?.advanceWhenRoute) return;
		// Element-based advance is edge-triggered: fire when the element goes from
		// absent → present (a fresh open), so a modal left over from a previous
		// step doesn't instantly skip this one. Route-based advance is immediate.
		let wasPresent = step.advanceWhen ? !!resolveVisible(step.advanceWhen) : false;
		const timer = setInterval(() => {
			const isPresent = step.advanceWhen ? !!resolveVisible(step.advanceWhen) : false;
			const freshAppearance = isPresent && !wasPresent;
			wasPresent = isPresent;
			const routeReady =
				step.advanceWhenRoute && matchesRoute(get(page).url.pathname, step.advanceWhenRoute);
			if (freshAppearance || routeReady) {
				clearInterval(timer);
				next();
			}
		}, 200);
		return () => clearInterval(timer);
	});

	// Auto-advance when the user changes a field's value (picks a date, selects a
	// time/option) — keeps the flow continuous on selection. The baseline value is
	// captured once the element is present, so a pre-filled default doesn't fire it.
	$effect(() => {
		const i = index;
		if (!open) return;
		const sel = steps[i]?.advanceOnValueChange;
		if (!sel) return;
		let baseline: string | null = null;
		let captured = false;
		const readValue = (): string | null => {
			const el = resolveVisible(sel) as HTMLInputElement | null;
			if (!el) return null;
			if (el.type === 'checkbox') return String(el.checked); // ticking counts as a change
			return el.value ?? '';
		};
		baseline = readValue();
		captured = baseline !== null;
		const timer = setInterval(() => {
			const cur = readValue();
			if (cur === null) return; // field not on screen yet
			if (!captured) {
				baseline = cur;
				captured = true;
				return;
			}
			if (cur !== baseline) {
				clearInterval(timer);
				next();
			}
		}, 200);
		return () => clearInterval(timer);
	});

	// For steps that expand the spotlight to a popover (spotlightWith), poll so
	// the highlight grows/shrinks as that popover opens and closes.
	$effect(() => {
		const i = index;
		if (!open) return;
		if (!steps[i]?.spotlightWith) return;
		const timer = setInterval(() => reposition(), 200);
		return () => clearInterval(timer);
	});

	// Keep everything aligned when the viewport changes — a lightweight realign
	// from the cached element, not a full (re-navigating) refresh.
	$effect(() => {
		if (!open) return;
		const onChange = () => reposition();
		window.addEventListener('resize', onChange);
		window.addEventListener('scroll', onChange, true);
		return () => {
			window.removeEventListener('resize', onChange);
			window.removeEventListener('scroll', onChange, true);
		};
	});

	function onKeydown(e: KeyboardEvent): void {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			skip();
		} else if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			back();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && current}
	<!-- Backdrop: pointer-events NONE so the user can actually interact with the
	     real app underneath (fill the form, open items, etc.). Transparent when a
	     spotlight is shown (the spotlight's own shadow dims the page), lightly dim
	     when the card is centered. -->
	<div
		class="pointer-events-none fixed inset-0 z-[100]"
		style="background: {targetRect ? 'transparent' : 'rgba(15, 23, 42, 0.45)'};"
		aria-hidden="true"
	></div>

	{#if targetRect}
		<!-- Spotlight hole via a large box-shadow (visual dimming only). -->
		<div
			class="pointer-events-none fixed z-[100] rounded-xl transition-all duration-300 ease-out"
			style="
				top: {targetRect.top - PAD}px;
				left: {targetRect.left - PAD}px;
				width: {targetRect.width + PAD * 2}px;
				height: {targetRect.height + PAD * 2}px;
				box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.4);
			"
		></div>
		<!-- Highlight ring (visual only, non-blocking) — the real element inside is
		     fully interactive because nothing here captures pointer events. -->
		<div
			class="tour-hotspot pointer-events-none fixed z-[101] rounded-xl ring-2 ring-pink-500 transition-all duration-300 ease-out"
			style="
				top: {targetRect.top - PAD}px;
				left: {targetRect.left - PAD}px;
				width: {targetRect.width + PAD * 2}px;
				height: {targetRect.height + PAD * 2}px;
			"
		></div>
	{/if}

	<!-- Tooltip / message card -->
	<div
		bind:this={cardEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="tour-title"
		class="fixed z-[102] w-[calc(100vw-24px)] max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5 transition-all duration-300 ease-out"
		style="top: {cardPos.top}px; left: {cardPos.left}px;"
	>
		<div class="mb-2 flex items-center justify-between">
			<span class="text-xs font-semibold uppercase tracking-wider text-pink-600">
				Step {index + 1} of {steps.length}
			</span>
			<button
				onclick={skip}
				class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
				aria-label="Close tour"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<h3 id="tour-title" class="text-base font-bold text-gray-900">{current.title}</h3>
		<p class="mt-1.5 text-sm leading-relaxed text-gray-600">{current.body}</p>

		{#if targetRect && (current.action === 'click' || current.clickHint)}
			<p class="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-pink-600">
				<svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
				</svg>
				{current.clickHint ?? 'Click the highlighted item to continue'}
			</p>
		{/if}

		<!-- Progress dots -->
		<div class="mt-4 flex items-center gap-1.5">
			{#each steps as _, i}
				<span
					class="h-1.5 rounded-full transition-all duration-300 {i === index
						? 'w-5 bg-pink-600'
						: 'w-1.5 bg-gray-300'}"
				></span>
			{/each}
		</div>

		<!-- Controls -->
		<div class="mt-4 flex items-center justify-between gap-3">
			{#if !isLast}
				<button
					onclick={skip}
					class="text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
				>
					Skip tour
				</button>
			{:else}
				<span></span>
			{/if}

			<div class="flex items-center gap-2">
				{#if !isFirst}
					<button
						onclick={back}
						class="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
					>
						Back
					</button>
				{/if}
				<button
					onclick={next}
					class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
				>
					{isLast ? 'Done' : 'Next'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Pulsing pink glow to signal the highlighted item is clickable. */
	.tour-hotspot {
		background: transparent;
		animation: tour-pulse 1.6s ease-in-out infinite;
	}
	@keyframes tour-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.5);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(236, 72, 153, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tour-hotspot {
			animation: none;
		}
	}
</style>
