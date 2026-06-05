import { describe, it, expect } from 'vitest';
import {
  canonicalizeUrl,
  isGoogleNewsRedirect,
  unwrapGoogleNewsLink,
} from '../../src/background/feeds/canonical';

describe('canonicalizeUrl', () => {
  it('should upgrade http to https when given an http url', () => {
    expect(canonicalizeUrl('http://example.com/story')).toBe('https://example.com/story');
  });

  it('should strip www./amp./m. host prefixes so they collapse to one identity', () => {
    const apex = canonicalizeUrl('https://bbc.com/news/x');
    expect(canonicalizeUrl('https://www.bbc.com/news/x')).toBe(apex);
    expect(canonicalizeUrl('https://amp.bbc.com/news/x')).toBe(apex);
    expect(canonicalizeUrl('https://m.bbc.com/news/x')).toBe(apex);
  });

  it('should produce one identity regardless of query-param order', () => {
    expect(canonicalizeUrl('https://example.com/a?b=2&a=1')).toBe(
      canonicalizeUrl('https://example.com/a?a=1&b=2'),
    );
  });

  it('should drop expanded tracking params (mc_cid, ref, spm, _ga)', () => {
    expect(canonicalizeUrl('https://example.com/a?mc_cid=1&ref=tw&spm=x&_ga=2&id=9')).toBe(
      'https://example.com/a?id=9',
    );
  });

  it('should strip utm_* and click-id tracking params when present', () => {
    expect(
      canonicalizeUrl('https://example.com/a?utm_source=x&utm_medium=y&fbclid=z&gclid=g&id=7'),
    ).toBe('https://example.com/a?id=7');
  });

  it('should strip the Google News oc param when present', () => {
    expect(canonicalizeUrl('https://news.google.com/rss/articles/abc?oc=5')).toBe(
      'https://news.google.com/rss/articles/abc',
    );
  });

  it('should keep meaningful query params when canonicalizing', () => {
    expect(canonicalizeUrl('https://example.com/s?page=2&q=fire')).toBe(
      'https://example.com/s?page=2&q=fire',
    );
  });

  it('should drop the fragment when present', () => {
    expect(canonicalizeUrl('https://example.com/a#section-3')).toBe('https://example.com/a');
  });

  it('should remove a trailing slash from non-root paths but keep the root slash', () => {
    expect(canonicalizeUrl('https://example.com/a/b/')).toBe('https://example.com/a/b');
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('should lowercase the hostname when given mixed case', () => {
    expect(canonicalizeUrl('https://Example.COM/a')).toBe('https://example.com/a');
  });

  it('should return the input unchanged when it is not a parseable url', () => {
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });

  it('should map tracking-param variants of the same article to one canonical form', () => {
    const a = canonicalizeUrl('https://example.com/story?utm_source=rss');
    const b = canonicalizeUrl('http://example.com/story/');
    expect(a).toBe(b);
  });
});

describe('isGoogleNewsRedirect', () => {
  it('should detect news.google.com links when given a redirect url', () => {
    expect(isGoogleNewsRedirect('https://news.google.com/rss/articles/CBMi?oc=5')).toBe(true);
  });

  it('should reject publisher links and unparseable input', () => {
    expect(isGoogleNewsRedirect('https://www.thehindu.com/news/x.ece')).toBe(false);
    expect(isGoogleNewsRedirect('nope')).toBe(false);
  });
});

describe('unwrapGoogleNewsLink', () => {
  it('should return the publisher href when the description anchor exposes one', () => {
    const desc =
      '&lt;a href="https://www.reuters.com/markets/story-1?utm=x" target="_blank"&gt;Title&lt;/a&gt;';
    expect(unwrapGoogleNewsLink(desc)).toBe('https://www.reuters.com/markets/story-1?utm=x');
  });

  it('should skip google-hosted hrefs and return null when none are publisher urls', () => {
    const desc =
      '&lt;a href="https://news.google.com/rss/articles/CBMi?oc=5" target="_blank"&gt;Title&lt;/a&gt;';
    expect(unwrapGoogleNewsLink(desc)).toBeNull();
  });

  it('should decode &amp;amp; inside the extracted href', () => {
    const desc = '&lt;a href="https://example.com/a?x=1&amp;y=2"&gt;t&lt;/a&gt;';
    expect(unwrapGoogleNewsLink(desc)).toBe('https://example.com/a?x=1&y=2');
  });

  it('should return null when the description is null or has no anchors', () => {
    expect(unwrapGoogleNewsLink(null)).toBeNull();
    expect(unwrapGoogleNewsLink('plain text snippet')).toBeNull();
  });
});
