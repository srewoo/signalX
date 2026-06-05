/** Deterministic, dependency-free string hashing for stable ids and cache keys. */

const FNV_OFFSET_64 = 14695981039346656037n;
const FNV_PRIME_64 = 1099511628211n;
const MASK_64 = (1n << 64n) - 1n;

/**
 * FNV-1a 64-bit, returned as a zero-padded base36 string. Stable across SW
 * restarts. 64-bit (vs 32-bit) keeps birthday-collision probability negligible
 * across the thousands of distinct article/cluster ids and cache keys a session
 * accumulates — a collision would otherwise serve a summary for the wrong story
 * or silently drop a cluster from the index.
 */
export function stableHash(input: string): string {
  let h = FNV_OFFSET_64;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * FNV_PRIME_64) & MASK_64;
  }
  // 2^64 in base36 is ~12.4 chars; pad to 13 for fixed-width ids.
  return h.toString(36).padStart(13, '0');
}
