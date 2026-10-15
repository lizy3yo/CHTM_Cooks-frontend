import { derived, get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { cartAPI, type CartItemResponse } from '$lib/api/cart';
import { subscribeToCartUpdates } from '$lib/api/cartStream';
import { practiceMode } from '$lib/stores/onboarding';

export interface RequestCartItem {
	itemId: string;
	name: string;
	quantity: number;
	maxQuantity: number;
	categoryId?: string;
	picture?: string;
}

interface RequestCartState {
	items: RequestCartItem[];
	loading: boolean;
	initialized: boolean;
	sseConnected: boolean;
}

type AddItemPayload = Omit<RequestCartItem, 'quantity'> & { quantity?: number; ifAbsent?: boolean };

type AddItemResult = 'added' | 'incremented' | 'capped' | 'unchanged';

/** A required item the cart must contain. */
export type RequiredCartItem = Omit<RequestCartItem, 'quantity'>;

const initialState: RequestCartState = {
	items: [],
	loading: false,
	initialized: false,
	sseConnected: false
};

/**
 * Convert API cart item to store format
 */
function toStoreItem(apiItem: CartItemResponse): RequestCartItem {
	return {
		itemId: apiItem.itemId,
		name: apiItem.name,
		quantity: apiItem.quantity,
		maxQuantity: apiItem.maxQuantity,
		categoryId: apiItem.categoryId,
		picture: apiItem.picture
	};
}

function createRequestCartStore() {
	const { subscribe, update, set } = writable<RequestCartState>(initialState);
	let sseUnsubscribe: (() => void) | null = null;
	// The layout and the page both call init() on mount; they share one request.
	let initPromise: Promise<void> | null = null;
	// Required-item syncs run one after another so two pages can't race each other.
	let requiredSync: Promise<unknown> = Promise.resolve();

	/**
	 * Sandbox for the guided tour. The tour tells students that nothing they do
	 * is saved, so while it runs, student edits change only this browser's copy
	 * of the cart. When the tour ends, the copy is reloaded from the server and
	 * the practice edits are gone.
	 */
	let sandboxed = false;

	function setItems(items: RequestCartItem[], source: string): void {
		update((state) => ({ ...state, items }));
		window.dispatchEvent(new CustomEvent('cart-updated', { detail: { items, source } }));
	}

	function currentItems(): RequestCartItem[] {
		return get({ subscribe }).items;
	}

	/** Same rules as POST /api/cart, applied to the local copy. */
	function addLocally(item: AddItemPayload): AddItemResult {
		const items = currentItems();
		const requested = item.quantity ?? 1;
		const existing = items.find((entry) => entry.itemId === item.itemId);

		if (existing && item.ifAbsent) return 'unchanged';

		if (existing) {
			const capped = existing.quantity + requested >= item.maxQuantity;
			const quantity = Math.min(existing.quantity + requested, item.maxQuantity);
			setItems(
				items.map((entry) =>
					entry.itemId === item.itemId ? { ...entry, quantity, maxQuantity: item.maxQuantity } : entry
				),
				'addItem'
			);
			return capped ? 'capped' : 'incremented';
		}

		setItems(
			[
				...items,
				{
					itemId: item.itemId,
					name: item.name,
					quantity: Math.min(requested, item.maxQuantity),
					maxQuantity: item.maxQuantity,
					categoryId: item.categoryId,
					picture: item.picture
				}
			],
			'addItem'
		);
		return 'added';
	}

	const store = {
		subscribe,

		/**
		 * Initialize cart by loading from database and setting up SSE.
		 * Safe to call from several places: concurrent and later calls resolve
		 * with the first load instead of fetching again.
		 */
		init(): Promise<void> {
			if (!browser) return Promise.resolve();
			if (!initPromise) {
				initPromise = this.load();
			}
			return initPromise;
		},

		async load(): Promise<void> {
			update((state) => ({ ...state, loading: true }));

			try {
				const cart = await cartAPI.getCart();
				const items = cart.items.map(toStoreItem);

				update((state) => ({
					...state,
					items,
					loading: false,
					initialized: true
				}));

				// Setup SSE for real-time updates
				this.connectSSE();
			} catch (error) {
				console.error('Failed to load cart from database:', error);
				update((state) => ({
					...state,
					loading: false,
					initialized: true
				}));
			}
		},

		/**
		 * Connect to SSE stream for real-time cart updates
		 */
		connectSSE(): void {
			if (!browser || sseUnsubscribe) return;

			console.log('[CART-STORE] Connecting to SSE stream...');

			sseUnsubscribe = subscribeToCartUpdates(
				(event) => {
					console.log('[CART-STORE] Received cart update from SSE:', event);
					const items = event.items.map(toStoreItem);
					
					update((state) => ({
						...state,
						items,
						sseConnected: true
					}));
				},
				(error) => {
					console.error('[CART-STORE] SSE error:', error);
					update((state) => ({
						...state,
						sseConnected: false
					}));
				}
			);

			update((state) => ({ ...state, sseConnected: true }));
		},

		/**
		 * Disconnect from SSE stream
		 */
		disconnectSSE(): void {
			if (sseUnsubscribe) {
				sseUnsubscribe();
				sseUnsubscribe = null;
				update((state) => ({ ...state, sseConnected: false }));
				console.log('[CART-STORE] Disconnected from SSE stream');
			}
		},

		/**
		 * Add item to cart (persists to database)
		 */
		async addItem(item: AddItemPayload): Promise<AddItemResult> {
			if (!browser) return 'added';
			if (sandboxed) return addLocally(item);

			try {
				const response = await cartAPI.addItem({
					itemId: item.itemId,
					name: item.name,
					quantity: item.quantity ?? 1,
					maxQuantity: item.maxQuantity,
					categoryId: item.categoryId,
					picture: item.picture,
					ifAbsent: item.ifAbsent
				});

				const items = response.items.map(toStoreItem);
				update((state) => ({ ...state, items }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items, source: 'addItem' }
					}));
				}

				return response.result;
			} catch (error) {
				console.error('Failed to add item to cart:', error);
				throw error;
			}
		},

		/**
		 * Make sure every required item is in the cart.
		 *
		 * Only items that are missing are sent, in a single request, and the
		 * server adds them with quantity 1 while leaving everything already in
		 * the cart exactly as it is. Calling this any number of times, from any
		 * page, never changes a quantity. Waits for the cart to load first, so
		 * it never acts on an empty, not-yet-loaded cart.
		 *
		 * Resolves with how many items were added.
		 */
		syncRequiredItems(required: RequiredCartItem[]): Promise<number> {
			if (!browser || required.length === 0) return Promise.resolve(0);

			const run = async (): Promise<number> => {
				await store.init();

				const inCart = new Set(currentItems().map((entry) => entry.itemId));
				const missing = required.filter((item) => !inCart.has(item.itemId));
				if (missing.length === 0) return 0;

				const response = await cartAPI.addItems(missing);
				const serverItems = response.items.map(toStoreItem);

				if (sandboxed) {
					// Keep the practice copy; just fold in the required items.
					const local = currentItems();
					const localIds = new Set(local.map((entry) => entry.itemId));
					setItems(
						[...local, ...serverItems.filter((entry) => !localIds.has(entry.itemId))],
						'syncRequiredItems'
					);
				} else {
					setItems(serverItems, 'syncRequiredItems');
				}

				return response.added;
			};

			const result = requiredSync.then(run, run);
			requiredSync = result.catch(() => undefined);
			return result;
		},

		/**
		 * Update item quantity (persists to database)
		 */
		async setQuantity(itemId: string, quantity: number): Promise<void> {
			if (!browser) return;

			if (sandboxed) {
				const items = currentItems();
				const entry = items.find((i) => i.itemId === itemId);
				if (!entry) throw new Error('Item not found in cart');
				const clamped = Math.max(1, Math.min(quantity, entry.maxQuantity));
				setItems(
					items.map((i) => (i.itemId === itemId ? { ...i, quantity: clamped } : i)),
					'setQuantity'
				);
				return;
			}

			try {
				const response = await cartAPI.updateQuantity(itemId, quantity);
				const items = response.items.map(toStoreItem);
				update((state) => ({ ...state, items }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items, source: 'setQuantity' }
					}));
				}
			} catch (error) {
				console.error('Failed to update cart quantity:', error);
				throw error;
			}
		},

		/**
		 * Remove item from cart (persists to database)
		 * Note: required items cannot be removed
		 */
		async removeItem(itemId: string): Promise<void> {
			if (!browser) return;

			if (sandboxed) {
				setItems(
					currentItems().filter((i) => i.itemId !== itemId),
					'removeItem'
				);
				return;
			}

			try {
				const response = await cartAPI.removeItem(itemId);
				const items = response.items.map(toStoreItem);
				update((state) => ({ ...state, items }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items, source: 'removeItem' }
					}));
				}
			} catch (error) {
				console.error('Failed to remove item from cart:', error);
				// Re-throw with more context for UI to handle
				const errorMessage = error instanceof Error ? error.message : 'Failed to remove item';
				throw new Error(errorMessage);
			}
		},

		/**
		 * Clear entire cart (persists to database)
		 */
		async clear(): Promise<void> {
			if (!browser) return;

			if (sandboxed) {
				setItems([], 'clear');
				return;
			}

			try {
				await cartAPI.clearCart();
				update((state) => ({ ...state, items: [] }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items: [], source: 'clear' }
					}));
				}
			} catch (error) {
				console.error('Failed to clear cart:', error);
				throw error;
			}
		},

		/**
		 * Refresh cart from database
		 */
		async refresh(): Promise<void> {
			if (!browser) return;

			try {
				const cart = await cartAPI.getCart();
				const items = cart.items.map(toStoreItem);
				update((state) => ({ ...state, items }));
			} catch (error) {
				console.error('Failed to refresh cart:', error);
			}
		},

		/**
		 * Reset client store state on user sign-out or session switch
		 */
		reset(): void {
			if (sseUnsubscribe) {
				sseUnsubscribe();
				sseUnsubscribe = null;
			}
			initPromise = null;
			set(initialState);
		}
	};

	if (browser) {
		practiceMode.subscribe((active) => {
			if (active === sandboxed) return;
			sandboxed = active;
			// Tour over: drop the practice copy and show the real cart again.
			if (!active) void store.refresh();
		});
	}

	return store;
}

export const requestCartStore = createRequestCartStore();

export const requestCartItems = derived(requestCartStore, ($store) => $store.items);

export const requestCartCount = derived(requestCartItems, ($items) =>
	$items.reduce((total, item) => total + item.quantity, 0)
);

export const requestCartLoading = derived(requestCartStore, ($store) => $store.loading);

export const requestCartInitialized = derived(requestCartStore, ($store) => $store.initialized);

export const requestCartSSEConnected = derived(requestCartStore, ($store) => $store.sseConnected);
