import { describe, it, expect } from 'vitest';
import {
  extractJsonObject,
  parseSummarySections,
  parseComparison,
  progressiveWhatHappened,
} from '../../src/background/llm/parse';

describe('extractJsonObject', () => {
  it('should return the object when given clean JSON', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('should strip fences and return the object when given a fenced json block', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('should extract the object when wrapped in prose', () => {
    expect(extractJsonObject('Here you go: {"a":1} hope that helps')).toBe('{"a":1}');
  });

  it('should ignore braces inside strings when balance-scanning', () => {
    expect(extractJsonObject('{"a":"} not closing {"}')).toBe('{"a":"} not closing {"}');
  });

  it('should handle nested objects when balance-scanning', () => {
    expect(extractJsonObject('{"a":{"b":1}}')).toBe('{"a":{"b":1}}');
  });

  it('should return null when given truncated JSON with no closing brace', () => {
    expect(extractJsonObject('{"a":1, "b":')).toBeNull();
  });

  it('should return null when given text with no object', () => {
    expect(extractJsonObject('totally not json')).toBeNull();
  });
});

describe('parseSummarySections', () => {
  it('should map all fields when given clean JSON', () => {
    const text = JSON.stringify({
      whatHappened: 'X occurred',
      keyEvents: ['a', 'b'],
      importantQuotes: ['q'],
      whatHappensNext: 'Y next',
    });
    const s = parseSummarySections(text);
    expect(s.whatHappened).toBe('X occurred');
    expect(s.keyEvents).toEqual(['a', 'b']);
    expect(s.importantQuotes).toEqual(['q']);
    expect(s.whatHappensNext).toBe('Y next');
    expect(s.keyFacts).toBeUndefined();
  });

  it('should include keyFacts when given the keyfacts variant', () => {
    const text = JSON.stringify({
      whatHappened: 'X',
      keyEvents: [],
      importantQuotes: [],
      whatHappensNext: '',
      keyFacts: ['fact1', 'fact2'],
    });
    const s = parseSummarySections(text);
    expect(s.keyFacts).toEqual(['fact1', 'fact2']);
  });

  it('should parse JSON from a fenced block when given markdown', () => {
    const text = '```json\n{"whatHappened":"fenced","keyEvents":[],"importantQuotes":[],"whatHappensNext":""}\n```';
    expect(parseSummarySections(text).whatHappened).toBe('fenced');
  });

  it('should fall back to full text in whatHappened when given non-JSON prose', () => {
    const s = parseSummarySections('The model just wrote prose with no JSON.');
    expect(s.whatHappened).toBe('The model just wrote prose with no JSON.');
    expect(s.keyEvents).toEqual([]);
    expect(s.whatHappensNext).toBe('');
  });

  it('should salvage prose without JSON scaffolding when given truncated JSON', () => {
    const s = parseSummarySections('{"whatHappened":"partial...');
    // Never leak raw JSON keys/braces to the user; salvage the readable text.
    expect(s.whatHappened).not.toContain('whatHappened');
    expect(s.whatHappened).not.toContain('{');
    expect(s.whatHappened).not.toContain('"');
    expect(s.whatHappened).toContain('partial');
    expect(s.keyEvents).toEqual([]);
  });

  it('should apply zod defaults for missing arrays when given a partial object', () => {
    // wrong-shaped: missing keyEvents/quotes; zod defaults fill them in.
    const s = parseSummarySections('{"whatHappened":"only this"}');
    expect(s.whatHappened).toBe('only this');
    expect(s.keyEvents).toEqual([]);
    expect(s.importantQuotes).toEqual([]);
  });

  it('should not leak JSON scaffolding in whatHappened when JSON has empty whatHappened', () => {
    const s = parseSummarySections('{"whatHappened":"","keyEvents":[],"importantQuotes":[],"whatHappensNext":""}');
    // d.whatHappened is '' (falsy) → salvage prose from the JSON-looking text,
    // which here has no readable content, so we never surface raw keys/braces.
    expect(s.whatHappened).not.toContain('whatHappened');
    expect(s.whatHappened).not.toContain('{');
  });

  it('should drop non-string array members via zod when given wrong-typed arrays', () => {
    // keyEvents has a number → zod array(string) fails → whole parse fails → fallback
    const s = parseSummarySections('{"whatHappened":"x","keyEvents":[1,2],"importantQuotes":[],"whatHappensNext":""}');
    expect(s.keyEvents).toEqual([]);
  });
});

describe('parseComparison', () => {
  it('should map fields and attach clusterId when given clean JSON', () => {
    const text = JSON.stringify({
      commonFacts: ['f1'],
      perspectives: [{ sourceName: 'BBC', perspective: 'p' }],
      coverageDifferences: 'diff',
    });
    const c = parseComparison(text, 'cid');
    expect(c.clusterId).toBe('cid');
    expect(c.commonFacts).toEqual(['f1']);
    expect(c.perspectives).toEqual([{ sourceName: 'BBC', perspective: 'p' }]);
    expect(c.coverageDifferences).toBe('diff');
  });

  it('should fall back with full text in coverageDifferences when given non-JSON', () => {
    const c = parseComparison('no json here', 'cid');
    expect(c.clusterId).toBe('cid');
    expect(c.commonFacts).toEqual([]);
    expect(c.perspectives).toEqual([]);
    expect(c.coverageDifferences).toBe('no json here');
  });

  it('should drop malformed perspective entries via zod and fall back when given wrong shape', () => {
    const c = parseComparison('{"perspectives":[{"sourceName":"X"}]}', 'cid');
    // missing perspective field → zod fails → fallback
    expect(c.perspectives).toEqual([]);
  });
});

describe('progressiveWhatHappened', () => {
  it('should return the partial string when streaming an incomplete value', () => {
    expect(progressiveWhatHappened('{"whatHappened":"so far so')).toBe('so far so');
  });

  it('should return the full string when the value is closed', () => {
    expect(progressiveWhatHappened('{"whatHappened":"done","keyEvents":[]}')).toBe('done');
  });

  it('should return empty string when the key is not present yet', () => {
    expect(progressiveWhatHappened('{"keyEvents":[]')).toBe('');
  });

  it('should decode escaped newlines and tabs when streaming', () => {
    expect(progressiveWhatHappened('{"whatHappened":"line1\\nline2\\ttab')).toBe('line1\nline2\ttab');
  });

  it('should handle escaped quotes inside the value when streaming', () => {
    expect(progressiveWhatHappened('{"whatHappened":"say \\"hi\\" now')).toBe('say "hi" now');
  });

  it('should return empty string when given empty input', () => {
    expect(progressiveWhatHappened('')).toBe('');
  });
});
