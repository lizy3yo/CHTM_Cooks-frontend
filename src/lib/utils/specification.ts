/**
 * Format an item's dimension specification (e.g. `8"x1"`, `10"x2`) with an
 * explicit "inches" unit spelled out beside it.
 *
 * Rules:
 *   - Only DIMENSION specs get a unit — i.e. ones that contain a number. Material
 *     or size descriptors like "PLASTIC", "GLASS", "STAINLESS", "SMALL", "BIG"
 *     are left exactly as-is (no "PLASTIC inches").
 *   - "inches" is only appended when the spec doesn't already contain the word
 *     "inch", so specs like `10"X3" inch` aren't doubled up. (The `"` symbol
 *     alone doesn't count — that's what we're spelling out.)
 *
 * Returns '' for empty/missing specs so callers can chain a fallback, e.g.
 * `{formatSpecification(item.specification) || '—'}`.
 */
export function formatSpecification(spec: string | undefined | null): string {
	if (!spec) return '';
	const trimmed = spec.trim();
	if (!trimmed) return '';
	// Not a dimension (no number) → leave descriptors like "PLASTIC" untouched.
	if (!/\d/.test(trimmed)) return trimmed;
	return /inch/i.test(trimmed) ? trimmed : `${trimmed} inches`;
}
