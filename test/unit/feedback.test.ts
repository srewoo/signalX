import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';
import type { FakeChrome } from '../helpers/chromeMock';

const FEEDBACK_KEY = '__signalx_feedback_v1';

let fake: FakeChrome;

beforeEach(() => {
  vi.resetModules();
  fake = installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import('../../src/background/storage/feedback');
}

function stored(): Array<Record<string, unknown>> {
  return (fake.storage.local.store.get(FEEDBACK_KEY) ?? []) as Array<Record<string, unknown>>;
}

describe('appendFeedback', () => {
  it('should record summaryType for summary-target feedback', async () => {
    const { appendFeedback } = await load();
    await appendFeedback('c1', 'summary', 'up', 'detailed');
    const entries = stored();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      clusterId: 'c1',
      target: 'summary',
      verdict: 'up',
      summaryType: 'detailed',
    });
    expect(typeof entries[0]?.at).toBe('string');
  });

  it('should omit summaryType for comparison-target feedback', async () => {
    const { appendFeedback } = await load();
    await appendFeedback('c2', 'comparison', 'down');
    const entries = stored();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ clusterId: 'c2', target: 'comparison', verdict: 'down' });
    expect(entries[0]).not.toHaveProperty('summaryType');
  });

  it('should not record summaryType for comparison even if one is passed', async () => {
    const { appendFeedback } = await load();
    await appendFeedback('c3', 'comparison', 'up', 'short');
    expect(stored()[0]).not.toHaveProperty('summaryType');
  });

  it('should append in order, preserving earlier entries', async () => {
    const { appendFeedback } = await load();
    await appendFeedback('c1', 'summary', 'up', 'short');
    await appendFeedback('c2', 'comparison', 'down');
    const entries = stored();
    expect(entries.map((e) => e.clusterId)).toEqual(['c1', 'c2']);
  });
});
