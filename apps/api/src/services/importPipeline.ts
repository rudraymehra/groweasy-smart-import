import type { HeaderMapping, JobEvent, JobStatus } from '@smart-import/shared';
import type { Env } from '../config/env.js';
import type { LLMProvider } from '../llm/provider.js';
import { logger } from '../middleware/requestLogger.js';
import { extractAll } from './batchExtractor.js';
import type { ParsedCsv } from './csvParser.js';
import { mapHeaders } from './headerMapper.js';
import type { Job } from './jobStore.js';
import { validateAndNormalize } from './postProcessor.js';

export interface PipelineDeps {
  provider: LLMProvider;
  env: Env;
}

function emit(job: Job, event: JobEvent): void {
  job.emitter.emit('event', event);
}

function setStatus(job: Job, status: JobStatus): void {
  job.status = status;
  emit(job, { type: 'status', status });
}

/**
 * Orchestrates parse → map → extract → validate for one job, mutating the job
 * record and emitting progress events for SSE subscribers along the way.
 * Runs detached from the request that created it — a client disconnect does
 * not kill the import; results stay pollable until the job TTL expires.
 */
export async function runImport(
  job: Job,
  parsed: ParsedCsv,
  confirmedMapping: HeaderMapping | null,
  deps: PipelineDeps,
): Promise<void> {
  const { provider, env } = deps;
  try {
    let mapping = confirmedMapping;
    if (!mapping) {
      setStatus(job, 'mapping');
      mapping = await mapHeaders(parsed.headers, parsed.rows.slice(0, 10), provider, env);
    }
    job.mapping = mapping;
    emit(job, { type: 'mapping', mapping });

    setStatus(job, 'extracting');
    const extraction = await extractAll(parsed.rows, mapping, parsed.headers, {
      provider,
      env,
      onProgress: (progress) => {
        job.progress = {
          batches_total: progress.batches_total,
          batches_done: progress.batches_done,
          rows_processed: progress.rows_processed,
          rows_total: progress.rows_total,
          parsed_so_far: progress.parsed_so_far,
          skipped_so_far: progress.skipped_so_far,
        };
        emit(job, { type: 'batch', progress: job.progress, retried: progress.retried });
      },
    });

    setStatus(job, 'validating');
    const result = validateAndNormalize({
      extracted: extraction.records,
      failedRowIndexes: extraction.failed_row_indexes,
      allRows: parsed.rows,
      mapping,
      totalRows: parsed.meta.total_rows,
    });

    job.result = result;
    job.status = 'done';
    emit(job, { type: 'status', status: 'done' });
    emit(job, { type: 'done', result });
    logger.info(
      { jobId: job.id, ...result.summary },
      'Import complete',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ jobId: job.id, err: error }, 'Import failed');
    job.status = 'failed';
    job.error = { code: 'IMPORT_FAILED', message };
    emit(job, { type: 'error', code: 'IMPORT_FAILED', message });
  }
}
