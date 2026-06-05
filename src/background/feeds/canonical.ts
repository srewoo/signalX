/**
 * URL canonicalization for stable article identity. The same story can arrive
 * with different tracking params (utm_*, fbclid), scheme, or host casing
 * depending on which feed carried it; hashing the canonical form lets
 * clustering/dedup recognise it as one article.
 */

const TRACKING_PARAM =
  /^(utm_\w+|fbclid|gclid|dclid|gclsrc|igshid|mc_cid|mc_eid|_ga|ref|ref_src|referrer|source|spm|oc|ocid|cmpid|cid|at_medium|at_campaign|wt\.mc_id|s_kwcid|ns_campaign|ns_mchannel)$/i;

/**
 * Normalize a URL for hashing so the same story from different feeds collapses
 * to one identity: https, lowercase host, no `www.`/`amp.`/`m.` host prefix, no
 * fragment, tracking params dropped, query params sorted, no trailing slash.
 */
export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^(www|amp|m|mobile)\./, '');
  url.hash = '';
  const drop: string[] = [];
  url.searchParams.forEach((_v, key) => {
    if (TRACKING_PARAM.test(key)) drop.push(key);
  });
  for (const key of drop) url.searchParams.delete(key);
  // Sort remaining params so `?a=1&b=2` and `?b=2&a=1` produce one identity.
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

/** True if the link is a Google News redirect rather than a publisher URL. */
export function isGoogleNewsRedirect(raw: string): boolean {
  try {
    return new URL(raw).hostname === 'news.google.com';
  } catch {
    return false;
  }
}

function isGoogleHost(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host === 'google.com' || host.endsWith('.google.com');
  } catch {
    return true; // unparseable — treat as not a usable publisher URL
  }
}

/**
 * Best-effort unwrap of a Google News redirect to the real publisher URL,
 * from the anchor inside the item's raw <description>.
 *
 * HONEST LIMITATION: as of 2026 Google News wraps EVERY link — including the
 * description anchor — in news.google.com/rss/articles/..., so this usually
 * returns null today. Kept because older GN payloads (and a possible future
 * revert) carry the publisher href here, and unwrapping is strictly better
 * when available: real URL for "open sources" and cross-feed dedup.
 */
export function unwrapGoogleNewsLink(descriptionRaw: string | null): string | null {
  if (!descriptionRaw) return null;
  const re = /href="(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(descriptionRaw)) !== null) {
    const href = m[1];
    if (!href) continue;
    const decoded = href.replace(/&amp;/g, '&');
    if (!isGoogleHost(decoded)) return decoded;
  }
  return null;
}
