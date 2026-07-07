/** Split items into chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Run `fn` over items with at most `limit` in flight. Results preserve input
 * order. Rejections propagate (callers wrap fn with their own error handling).
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RetryOptions {
  retries: number;
  baseMs?: number;
  maxMs?: number;
  /** Return false to stop retrying for this error (e.g. truncation → bisect instead). */
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Exponential backoff with full jitter. Note the Anthropic SDK already retries
 * 429/5xx internally honouring retry-after; this layer covers everything else
 * (schema-validation failures, reconciliation retries).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { retries, baseMs = 1500, maxMs = 20000, shouldRetry, onRetry } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || (shouldRetry && !shouldRetry(error))) break;
      onRetry?.(error, attempt + 1);
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      await sleep(backoff * (0.5 + Math.random() * 0.5));
    }
  }
  throw lastError;
}
