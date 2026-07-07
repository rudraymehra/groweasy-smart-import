import {
  BatchExtractionResponseSchema,
  type HeaderMapping,
  type RawExtractedRecord,
} from '@smart-import/shared';
import type { Env } from '../config/env.js';
import { chunk, runWithConcurrency, withRetry } from '../lib/batching.js';
import { TruncationError } from '../lib/errors.js';
import type { LLMProvider } from '../llm/provider.js';
import {
  ROW_EXTRACTION_SYSTEM,
  buildRowExtractionUserMessage,
  type RowSerializationContext,
} from '../llm/prompts/rowExtraction.js';
import { logger } from '../middleware/requestLogger.js';
import type { ParsedRow } from './csvParser.js';

export interface BatchProgress {
  batches_total: number;
  batches_done: number;
  rows_processed: number;
  rows_total: number;
  parsed_so_far: number;
  skipped_so_far: number;
  retried: boolean;
}

export interface ExtractionResult {
  records: RawExtractedRecord[];
  /** Rows the model failed to return even after retries + bisection. */
  failed_row_indexes: number[];
}

interface ExtractorDeps {
  provider: LLMProvider;
  env: Env;
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * The assignment's core requirement: send rows to the AI in batches.
 *
 * Reliability layers, in order:
 *  1. Constrained decoding — output is schema-valid by construction.
 *  2. SDK-level retries for 429/5xx (honours retry-after).
 *  3. withRetry for schema/validation-level failures (backoff + jitter).
 *  4. Row-index reconciliation — missing rows are re-queued once as a mini-batch.
 *  5. Bisection — a persistently failing batch splits in half recursively, so a
 *     single poison row costs one row, not the whole batch.
 */
export async function extractAll(
  rows: ParsedRow[],
  mapping: HeaderMapping,
  headers: string[],
  deps: ExtractorDeps,
): Promise<ExtractionResult> {
  const { provider, env, onProgress } = deps;
  const ctx: RowSerializationContext = { mapping, headers };
  const batches = chunk(rows, env.BATCH_SIZE);

  const collected: RawExtractedRecord[] = [];
  const failed: number[] = [];
  let batchesDone = 0;
  let rowsProcessed = 0;
  let parsedSoFar = 0;
  let skippedSoFar = 0;
  let anyRetried = false;

  const callModel = async (batch: ParsedRow[]): Promise<RawExtractedRecord[]> => {
    const { data } = await provider.generateStructured({
      model: env.EXTRACTION_MODEL,
      system: ROW_EXTRACTION_SYSTEM,
      user: buildRowExtractionUserMessage(batch, ctx),
      schema: BatchExtractionResponseSchema,
      schemaName: 'batch_extraction',
      // ~150 output tokens per record + headroom; well under Haiku's 64K cap.
      maxOutputTokens: Math.min(32000, 2000 + batch.length * 400),
    });
    return data.records;
  };

  /** Extract one batch with retries; bisect on persistent failure. */
  const processBatch = async (batch: ParsedRow[], allowRequeue: boolean): Promise<void> => {
    let records: RawExtractedRecord[];
    try {
      records = await withRetry(() => callModel(batch), {
        retries: 3,
        shouldRetry: (e) => !(e instanceof TruncationError),
        onRetry: (e, attempt) => {
          anyRetried = true;
          logger.warn({ attempt, rows: batch.length, err: (e as Error).message }, 'Retrying batch');
        },
      });
    } catch (error) {
      if (batch.length > 1) {
        logger.warn({ rows: batch.length }, 'Batch failed after retries — bisecting');
        anyRetried = true;
        const mid = Math.ceil(batch.length / 2);
        await processBatch(batch.slice(0, mid), allowRequeue);
        await processBatch(batch.slice(mid), allowRequeue);
        return;
      }
      logger.error({ row: batch[0]!.row_index, err: (error as Error).message }, 'Row failed');
      failed.push(batch[0]!.row_index);
      return;
    }

    // Reconciliation: the model must return exactly the row_indexes it was sent.
    const sent = new Map(batch.map((r) => [r.row_index, r]));
    const seen = new Set<number>();
    for (const record of records) {
      if (sent.has(record.row_index) && !seen.has(record.row_index)) {
        seen.add(record.row_index);
        collected.push(record);
      }
      // Unknown or duplicate row_index → dropped (first occurrence wins).
    }
    const missing = batch.filter((r) => !seen.has(r.row_index));
    if (missing.length > 0) {
      if (allowRequeue) {
        anyRetried = true;
        logger.warn({ rows: missing.map((r) => r.row_index) }, 'Rows missing — re-queueing once');
        await processBatch(missing, false);
      } else {
        failed.push(...missing.map((r) => r.row_index));
      }
    }
  };

  await runWithConcurrency(batches, env.MAX_CONCURRENCY, async (batch) => {
    await processBatch(batch, true);
    batchesDone++;
    rowsProcessed += batch.length;
    // Live estimate for the progress UI; final numbers come from post-processing.
    const inBatch = collected.filter((r) => sentIn(batch, r.row_index));
    parsedSoFar += inBatch.filter((r) => r.email || r.phone_raw || r.extra_phones.length > 0).length;
    skippedSoFar = rowsProcessed - parsedSoFar;
    onProgress?.({
      batches_total: batches.length,
      batches_done: batchesDone,
      rows_processed: rowsProcessed,
      rows_total: rows.length,
      parsed_so_far: parsedSoFar,
      skipped_so_far: skippedSoFar,
      retried: anyRetried,
    });
  });

  return { records: collected, failed_row_indexes: failed };
}

function sentIn(batch: ParsedRow[], rowIndex: number): boolean {
  return batch.some((r) => r.row_index === rowIndex);
}
