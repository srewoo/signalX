import { describe, it, expect } from 'vitest';
import { readSse } from '../../src/background/llm/provider';

/** Build a fake Response whose body streams the given string chunks. */
function streamOf(chunks: readonly string[]): Response {
  const enc = new TextEncoder();
  let i = 0;
  const reader = {
    read: async () =>
      i < chunks.length
        ? { done: false, value: enc.encode(chunks[i++]) }
        : { done: true, value: undefined },
    releaseLock: () => undefined,
    cancel: async () => undefined,
  };
  return { body: { getReader: () => reader } } as unknown as Response;
}

const never = new AbortController().signal;

describe('readSse', () => {
  it('should emit one event per data line for typical single-line events', async () => {
    const events: string[] = [];
    await readSse(streamOf(['data: {"a":1}\n\n', 'data: [DONE]\n\n']), (d) => events.push(d), never);
    expect(events).toEqual(['{"a":1}', '[DONE]']);
  });

  it('should reassemble a data payload split across read() chunks', async () => {
    const events: string[] = [];
    // The JSON is split mid-line across two network reads.
    await readSse(streamOf(['data: {"hel', 'lo":"world"}\n\n']), (d) => events.push(d), never);
    expect(events).toEqual(['{"hello":"world"}']);
  });

  it('should concatenate multiple data: lines within one event (SSE spec)', async () => {
    const events: string[] = [];
    await readSse(streamOf(['data: line1\ndata: line2\n\n']), (d) => events.push(d), never);
    expect(events).toEqual(['line1\nline2']);
  });

  it('should handle CRLF line endings and ignore comment lines', async () => {
    const events: string[] = [];
    await readSse(streamOf([': keep-alive\r\ndata: {"x":1}\r\n\r\n']), (d) => events.push(d), never);
    expect(events).toEqual(['{"x":1}']);
  });

  it('should flush a trailing event with no final blank line', async () => {
    const events: string[] = [];
    await readSse(streamOf(['data: {"end":true}']), (d) => events.push(d), never);
    expect(events).toEqual(['{"end":true}']);
  });

  it('should stop and cancel when the signal is already aborted', async () => {
    const events: string[] = [];
    const ac = new AbortController();
    ac.abort();
    await expect(
      readSse(streamOf(['data: {"a":1}\n\n']), (d) => events.push(d), ac.signal),
    ).rejects.toBeInstanceOf(DOMException);
    expect(events).toEqual([]);
  });
});
