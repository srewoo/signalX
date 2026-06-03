/** Relative-time formatting for "updated Xm ago" / source ages. Pure functions. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now" | "42 min ago" | "1 hr ago" | "2 hrs ago" | "Yesterday" | "Jun 2". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = now - then;
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
  }
  if (diff < 2 * DAY) return 'Yesterday';
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Compact age for source rows: "42m ago" | "1h ago" | "Jun 2". */
export function shortAge(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = now - then;
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MIN))}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
