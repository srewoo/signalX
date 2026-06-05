import { describe, it, expect } from 'vitest';
import { stableHash } from '../../src/background/hash';

describe('stableHash', () => {
  it('should return the same hash for the same input when called repeatedly', () => {
    expect(stableHash('https://example.com/a')).toBe(stableHash('https://example.com/a'));
  });

  it('should return different hashes for different inputs in the common case', () => {
    expect(stableHash('alpha')).not.toBe(stableHash('beta'));
  });

  it('should return a non-empty base36 string padded to at least 13 chars', () => {
    const h = stableHash('x');
    expect(h.length).toBeGreaterThanOrEqual(13);
    expect(/^[0-9a-z]+$/.test(h)).toBe(true);
  });

  it('should handle empty string without throwing', () => {
    expect(() => stableHash('')).not.toThrow();
    expect(stableHash('')).toBe(stableHash(''));
  });

  it('should handle unicode input without throwing', () => {
    expect(() => stableHash('東京 café 🚀')).not.toThrow();
    expect(stableHash('東京')).not.toBe(stableHash('café'));
  });

  it('should produce distinct hashes across a sample of urls (collision sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(stableHash(`https://example.com/article/${i}`));
    // FNV-1a should give no collisions across this small sample
    expect(seen.size).toBe(2000);
  });
});
