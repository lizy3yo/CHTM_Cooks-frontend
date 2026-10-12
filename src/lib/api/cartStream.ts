import type { CartItemResponse } from './cart';

/**
 * Cart Update Event
 */
export interface CartUpdateEvent {
	items: CartItemResponse[];
	updatedAt: string;
	timestamp: string;
}

/**
 * Subscribe to cart updates.
 *
 * This used to open a dedicated event stream to `/api/cart/stream`. That
 * endpoint only ever sent heartbeats — it has no `cart-updated` event — so the
 * stream delivered nothing, yet every signed-in student held a second PHP
 * worker open for it on top of the shared realtime connection. On a small
 * worker pool that alone was enough to make ordinary requests queue.
 *
 * A cart belongs to one user and is written only by that user's own actions,
 * which already update the cart store directly, so there is nothing to push.
 * The function is kept so existing callers need no change; it opens no
 * connection and returns a no-op cleanup.
 *
 * @returns Cleanup function
 */
export function subscribeToCartUpdates(
	onUpdate: (event: CartUpdateEvent) => void,
	onError?: (error: Error) => void
): () => void {
	// Accepted for compatibility; there is no server event to hand to them.
	void onUpdate;
	void onError;
	return () => {};
}

/** Hook-style alias of {@link subscribeToCartUpdates}. */
export function useCartStream(
	onUpdate: (event: CartUpdateEvent) => void,
	onError?: (error: Error) => void
): () => void {
	return subscribeToCartUpdates(onUpdate, onError);
}
