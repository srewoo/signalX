import { describe, it, expect } from 'vitest';
import { estTokens, estCostUsd } from '../../src/background/llm/cost';

describe('estTokens', () => {
  it('should approximate tokens as ceil(chars/4) when given text', () => {
    expect(estTokens('')).toBe(0);
    expect(estTokens('abcd')).toBe(1);
    expect(estTokens('abcde')).toBe(2);
  });
});

describe('estCostUsd', () => {
  it('should return 0 for empty prompt and completion', () => {
    expect(estCostUsd('anthropic', 'claude-3-5-haiku-latest', '', '')).toBe(0);
  });

  it('should use the model-specific price when the model is known', () => {
    // gpt-4o-mini: in 0.15/M, out 0.6/M. 4000 chars => 1000 tokens each.
    const prompt = 'a'.repeat(4000);
    const completion = 'b'.repeat(4000);
    const cost = estCostUsd('openai', 'gpt-4o-mini', prompt, completion);
    // 1000/1e6*0.15 + 1000/1e6*0.6 = 0.00015 + 0.0006 = 0.00075
    expect(cost).toBeCloseTo(0.00075, 6);
  });

  it('should fall back to provider defaults when the model is unknown', () => {
    const prompt = 'a'.repeat(4000);
    const cost = estCostUsd('anthropic', 'some-future-model', prompt, '');
    // default anthropic in 0.8/M, 1000 tokens => 0.0008
    expect(cost).toBeCloseTo(0.0008, 6);
  });

  it('should produce a higher cost for output than input given equal lengths and out>in pricing', () => {
    const text = 'x'.repeat(4000);
    const inOnly = estCostUsd('openai', 'gpt-4o', text, '');
    const outOnly = estCostUsd('openai', 'gpt-4o', '', text);
    expect(outOnly).toBeGreaterThan(inOnly);
  });

  it('should return a non-negative finite number for any input', () => {
    const cost = estCostUsd('gemini', 'gemini-1.5-flash', 'hello world', 'response here');
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('should round to 6 decimal places when computing cost', () => {
    const cost = estCostUsd('openai', 'gpt-4o-mini', 'tiny', 'x');
    const decimals = (cost.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(6);
  });
});
