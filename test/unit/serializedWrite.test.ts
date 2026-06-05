import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';
import { withSerializedWrite } from '../../src/background/storage/area';

beforeEach(() => {
  vi.resetModules();
  installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withSerializedWrite', () => {
  it('should run same-key read-modify-writes sequentially (no lost update)', async () => {
    let shared = 0;
    // Simulate read-modify-write with an await tick between read and write.
    const rmw = () =>
      withSerializedWrite('k', async () => {
        const cur = shared;
        await Promise.resolve();
        shared = cur + 1;
      });
    await Promise.all([rmw(), rmw(), rmw(), rmw(), rmw()]);
    // Without serialization the interleaved reads would lose updates (< 5).
    expect(shared).toBe(5);
  });

  it('should keep the chain alive for later callers when one link rejects', async () => {
    const order: string[] = [];
    const ok1 = withSerializedWrite('k', async () => {
      order.push('a');
    });
    const boom = withSerializedWrite('k', async () => {
      order.push('b');
      throw new Error('fail');
    });
    const ok2 = withSerializedWrite('k', async () => {
      order.push('c');
    });
    await ok1;
    await expect(boom).rejects.toThrow('fail');
    await ok2;
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('should not serialize across distinct keys', async () => {
    const events: string[] = [];
    const slow = withSerializedWrite('k1', async () => {
      await Promise.resolve();
      await Promise.resolve();
      events.push('slow');
    });
    const fast = withSerializedWrite('k2', async () => {
      events.push('fast');
    });
    await Promise.all([slow, fast]);
    // Different keys run concurrently; the fast one finishes first.
    expect(events[0]).toBe('fast');
  });
});
