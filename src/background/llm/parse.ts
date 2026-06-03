import type { SourceComparison, SummarySections } from '../../shared/contracts';
import { z } from 'zod';

/**
 * Defensive extraction of JSON from LLM text. Strips code fences, balance-scans
 * for the first complete {...} object, validates against a schema, and on any
 * failure degrades gracefully — never throws.
 */

const sectionsSchema = z.object({
  whatHappened: z.string().default(''),
  keyEvents: z.array(z.string()).default([]),
  importantQuotes: z.array(z.string()).default([]),
  whatHappensNext: z.string().default(''),
  keyFacts: z.array(z.string()).optional(),
});

const comparisonSchema = z.object({
  commonFacts: z.array(z.string()).default([]),
  perspectives: z
    .array(z.object({ sourceName: z.string(), perspective: z.string() }))
    .default([]),
  coverageDifferences: z.string().default(''),
});

function stripFences(text: string): string {
  return text.replace(/```(?:json)?/gi, '').trim();
}

const JSON_KEY_HINT = /"(?:keyEvents|whatHappened|whatHappensNext|importantQuotes|keyFacts|commonFacts|perspectives|coverageDifferences)"/;

/** Heuristic: does this look like JSON scaffolding rather than plain prose? */
function looksLikeJson(text: string): boolean {
  const t = stripFences(text);
  return t.startsWith('{') || t.startsWith('[') || JSON_KEY_HINT.test(t);
}

/**
 * Salvage human-readable prose from text we failed to parse as JSON. Strips
 * fences/tags, removes JSON punctuation and quoted key names, and returns the
 * first few sentences. Never returns raw `{`/`"key":` scaffolding to the user.
 */
function salvageProse(text: string): string {
  const cleaned = stripFences(text)
    .replace(/"[a-zA-Z]+"\s*:/g, ' ') // "key": pairs
    .replace(/[{}[\]"]/g, ' ') // structural punctuation
    .replace(/\s*[,:]\s*/g, ' ') // stray separators
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  // Bound to roughly the first 2–3 sentences so we don't dump a wall of text.
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) return sentences.slice(0, 3).join(' ').trim();
  return cleaned.slice(0, 400).trim();
}

/**
 * Fallback whatHappened text: clean prose passes through; JSON-looking scaffolding
 * is salvaged into prose so the user never sees raw `{"whatHappened":...}` dumps.
 */
function fallbackText(text: string): string {
  if (looksLikeJson(text)) return salvageProse(text);
  return stripFences(text);
}

/** Return the first balanced {...} substring, or null. */
export function extractJsonObject(text: string): string | null {
  const cleaned = stripFences(text);
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function tryParse(text: string): unknown {
  const json = extractJsonObject(text);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Parse summary sections. Falls back to whole text in whatHappened. */
export function parseSummarySections(text: string): SummarySections {
  const candidate = tryParse(text);
  if (candidate !== null) {
    const parsed = sectionsSchema.safeParse(candidate);
    if (parsed.success) {
      const d = parsed.data;
      return {
        whatHappened: d.whatHappened || fallbackText(text),
        keyEvents: d.keyEvents,
        importantQuotes: d.importantQuotes,
        whatHappensNext: d.whatHappensNext,
        ...(d.keyFacts ? { keyFacts: d.keyFacts } : {}),
      };
    }
  }
  return {
    whatHappened: fallbackText(text),
    keyEvents: [],
    importantQuotes: [],
    whatHappensNext: '',
  };
}

/** Parse a source comparison. Falls back to whole text in coverageDifferences. */
export function parseComparison(text: string, clusterId: string): SourceComparison {
  const candidate = tryParse(text);
  if (candidate !== null) {
    const parsed = comparisonSchema.safeParse(candidate);
    if (parsed.success) {
      return { clusterId, ...parsed.data };
    }
  }
  return {
    clusterId,
    commonFacts: [],
    perspectives: [],
    coverageDifferences: fallbackText(text),
  };
}

/**
 * Progressive extraction of the "whatHappened" string from a partial JSON
 * stream, for live streaming into the UI. Returns the best-effort text so far.
 */
export function progressiveWhatHappened(partial: string): string {
  const cleaned = stripFences(partial);
  const keyIdx = cleaned.indexOf('"whatHappened"');
  if (keyIdx === -1) return '';
  const colon = cleaned.indexOf(':', keyIdx);
  if (colon === -1) return '';
  const quoteStart = cleaned.indexOf('"', colon + 1);
  if (quoteStart === -1) return '';
  let out = '';
  let escaped = false;
  for (let i = quoteStart + 1; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      out += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') break;
    out += ch;
  }
  return out;
}
