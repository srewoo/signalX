import { describe, it, expect } from 'vitest';
import { relativeTime, shortAge } from '../../src/panel/lib/time';

const NOW = Date.parse('2026-06-03T12:00:00.000Z');
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('should return "just now" when less than a minute ago', () => {
    expect(relativeTime(iso(0), NOW)).toBe('just now');
    expect(relativeTime(iso(MIN - 1), NOW)).toBe('just now');
  });

  it('should return minutes when between 1 minute and 1 hour ago', () => {
    expect(relativeTime(iso(MIN), NOW)).toBe('1 min ago');
    expect(relativeTime(iso(42 * MIN), NOW)).toBe('42 min ago');
  });

  it('should return singular hr at exactly one hour ago', () => {
    expect(relativeTime(iso(HOUR), NOW)).toBe('1 hr ago');
  });

  it('should return plural hrs when multiple hours ago within a day', () => {
    expect(relativeTime(iso(2 * HOUR), NOW)).toBe('2 hrs ago');
    expect(relativeTime(iso(23 * HOUR), NOW)).toBe('23 hrs ago');
  });

  it('should return "Yesterday" when between 1 and 2 days ago', () => {
    expect(relativeTime(iso(DAY), NOW)).toBe('Yesterday');
    expect(relativeTime(iso(DAY + HOUR), NOW)).toBe('Yesterday');
  });

  it('should return a formatted date when more than 2 days ago', () => {
    const out = relativeTime(iso(5 * DAY), NOW);
    expect(out).not.toBe('Yesterday');
    expect(out.length).toBeGreaterThan(0);
  });

  it('should return empty string when given an unparseable date', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});

describe('shortAge', () => {
  it('should return minutes with at least 1m when under an hour', () => {
    expect(shortAge(iso(0), NOW)).toBe('1m ago');
    expect(shortAge(iso(30 * MIN), NOW)).toBe('30m ago');
  });

  it('should return hours when between an hour and a day', () => {
    expect(shortAge(iso(HOUR), NOW)).toBe('1h ago');
    expect(shortAge(iso(5 * HOUR), NOW)).toBe('5h ago');
  });

  it('should return a formatted date when a day or more ago', () => {
    expect(shortAge(iso(2 * DAY), NOW).length).toBeGreaterThan(0);
    expect(shortAge(iso(2 * DAY), NOW)).not.toContain('ago');
  });

  it('should return empty string when given an unparseable date', () => {
    expect(shortAge('garbage', NOW)).toBe('');
  });
});
