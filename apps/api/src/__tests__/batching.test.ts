import { describe, expect, it, vi } from 'vitest';
import { chunk, runWithConcurrency, withRetry } from '../lib/batching.js';

describe('chunk', () => {
  it('splits into even chunks with a remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns one chunk when size exceeds length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
  it('handles empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('runWithConcurrency', () => {
  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('preserves result order regardless of completion order', async () => {
    const results = await runWithConcurrency([30, 5, 20, 1], 4, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(results).toEqual([30, 5, 20, 1]);
  });
});

describe('withRetry', () => {
  it('returns on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { retries: 3, baseMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries the configured number of times then throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withRetry(fn, { retries: 2, baseMs: 1 })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('succeeds after transient failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('recovered');
    await expect(withRetry(fn, { retries: 3, baseMs: 1 })).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops immediately when shouldRetry returns false', async () => {
    const fatal = new Error('do not retry');
    const fn = vi.fn().mockRejectedValue(fatal);
    await expect(
      withRetry(fn, { retries: 5, baseMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow('do not retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reports each retry via onRetry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    await withRetry(fn, { retries: 2, baseMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
