import { describe, it, expect } from 'vitest';
import { parseFeed } from '../../src/background/feeds/rss';

describe('parseFeed', () => {
  it('should parse a valid RSS 2.0 document when given well-formed XML', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Mars rover finds water</title>
        <link>https://example.com/mars</link>
        <pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate>
        <description>A short snippet</description>
      </item>
    </channel></rss>`;
    const out = parseFeed(xml, 'bbc', 'BBC');
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('Mars rover finds water');
    expect(out[0]!.url).toBe('https://example.com/mars');
    expect(out[0]!.sourceId).toBe('bbc');
    expect(out[0]!.sourceName).toBe('BBC');
    expect(out[0]!.snippet).toBe('A short snippet');
    expect(out[0]!.publishedAt).toBe('2026-06-02T10:00:00.000Z');
  });

  it('should parse Atom entries with href links and published dates when given Atom XML', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom headline here</title>
        <link href="https://example.com/atom" rel="alternate"/>
        <published>2026-06-01T08:00:00Z</published>
        <summary>Atom summary text</summary>
      </entry>
    </feed>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe('https://example.com/atom');
    expect(out[0]!.snippet).toBe('Atom summary text');
    expect(out[0]!.publishedAt).toBe('2026-06-01T08:00:00.000Z');
  });

  it('should skip malformed items and keep good ones when given partially-broken XML', () => {
    const xml = `<rss><channel>
      <item><title>No link here</title></item>
      <item><link>https://example.com/no-title</link></item>
      <item><title>Good one</title><link>https://example.com/good</link></item>
    </channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('Good one');
  });

  it('should not throw and return zero or partial items when given truncated XML', () => {
    const xml = `<rss><channel><item><title>Cut off here</title><link>https://example.com/x</link>`;
    // The closing </item> is missing, so ITEM_RE won't match — expect no throw, empty out.
    expect(() => parseFeed(xml, 'src', 'Source')).not.toThrow();
    expect(parseFeed(xml, 'src', 'Source')).toEqual([]);
  });

  it('should return empty array when given totally non-XML text', () => {
    expect(parseFeed('not xml at all <<>>', 'src', 'Source')).toEqual([]);
  });

  it('should return empty array when given empty string', () => {
    expect(parseFeed('', 'src', 'Source')).toEqual([]);
  });

  it('should unwrap CDATA titles when given CDATA-wrapped content', () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[Breaking: <b>Big</b> news]]></title>
      <link>https://example.com/cdata</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out[0]!.title).toBe('Breaking: Big news');
  });

  it('should decode HTML entities in titles when given encoded content', () => {
    const xml = `<rss><channel><item>
      <title>Tom &amp; Jerry &lt;win&gt; &quot;award&quot; &#39;here&#39;</title>
      <link>https://example.com/ent</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out[0]!.title).toBe('Tom & Jerry <win> "award" \'here\'');
  });

  it('should decode numeric entities when given &#NN; sequences', () => {
    const xml = `<rss><channel><item>
      <title>caf&#233; opens</title>
      <link>https://example.com/num</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out[0]!.title).toBe('café opens');
  });

  it('should default publishedAt to a valid ISO string when pubDate is missing', () => {
    const xml = `<rss><channel><item>
      <title>No date item</title>
      <link>https://example.com/nodate</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out).toHaveLength(1);
    expect(Number.isNaN(Date.parse(out[0]!.publishedAt))).toBe(false);
  });

  it('should split the Google News " - Publisher" suffix into the source name when present', () => {
    const xml = `<rss><channel><item>
      <title>Economy grows in Q2 - Reuters</title>
      <link>https://example.com/gn</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'googlenews', 'Google News');
    expect(out[0]!.title).toBe('Economy grows in Q2');
    expect(out[0]!.sourceName).toBe('Reuters');
  });

  it('should NOT split when the trailing dash segment is too long', () => {
    const longTail = 'x'.repeat(70);
    const xml = `<rss><channel><item>
      <title>Headline - ${longTail}</title>
      <link>https://example.com/long</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out[0]!.title).toContain(longTail);
    expect(out[0]!.sourceName).toBe('Source');
  });

  it('should skip items whose link is not http(s) when validating urls', () => {
    const xml = `<rss><channel><item>
      <title>Bad scheme</title>
      <link>ftp://example.com/x</link>
    </item></channel></rss>`;
    expect(parseFeed(xml, 'src', 'Source')).toEqual([]);
  });

  it('should cap output at the per-feed item limit when given many items', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      `<item><title>Item number ${i}</title><link>https://example.com/${i}</link></item>`,
    ).join('');
    const out = parseFeed(`<rss><channel>${items}</channel></rss>`, 'src', 'Source');
    expect(out.length).toBe(40);
  });

  it('should produce a stable id derived from the url when parsing', () => {
    const xml = `<rss><channel><item>
      <title>Stable</title><link>https://example.com/stable</link>
    </item></channel></rss>`;
    const a = parseFeed(xml, 'src', 'Source');
    const b = parseFeed(xml, 'src', 'Source');
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(a[0]!.id.length).toBeGreaterThan(0);
  });

  it('should unwrap a Google News redirect link when the description anchor exposes the publisher url', () => {
    const xml = `<rss><channel><item>
      <title>Markets rally - Reuters</title>
      <link>https://news.google.com/rss/articles/CBMiABC?oc=5</link>
      <description>&amp;lt;a href="https://www.reuters.com/markets/rally" target="_blank"&amp;gt;Markets rally&amp;lt;/a&amp;gt;</description>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'reuters', 'Reuters');
    expect(out[0]!.url).toBe('https://www.reuters.com/markets/rally');
  });

  it('should keep the Google News link when the description has no publisher url', () => {
    const xml = `<rss><channel><item>
      <title>Story - Reuters</title>
      <link>https://news.google.com/rss/articles/CBMiABC?oc=5</link>
      <description>&amp;lt;a href="https://news.google.com/rss/articles/CBMiABC?oc=5"&amp;gt;Story&amp;lt;/a&amp;gt;</description>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'reuters', 'Reuters');
    expect(out[0]!.url).toBe('https://news.google.com/rss/articles/CBMiABC?oc=5');
  });

  it('should derive the same id for tracking-param variants of the same article url', () => {
    const make = (link: string) =>
      parseFeed(
        `<rss><channel><item><title>Same story</title><link>${link}</link></item></channel></rss>`,
        'src',
        'Source',
      );
    const a = make('https://example.com/story?utm_source=rss&amp;utm_medium=feed');
    const b = make('http://example.com/story/');
    expect(a[0]!.id).toBe(b[0]!.id);
  });

  it('should omit snippet when no description or summary present', () => {
    const xml = `<rss><channel><item>
      <title>No snippet</title><link>https://example.com/ns</link>
    </item></channel></rss>`;
    const out = parseFeed(xml, 'src', 'Source');
    expect(out[0]!.snippet).toBeUndefined();
  });
});
