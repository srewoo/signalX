/** Deterministic, dependency-free string hashing for stable ids and cache keys. */

/** FNV-1a 32-bit, returned as a zero-padded base36 string. Stable across SW restarts. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619 with 32-bit overflow
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}
