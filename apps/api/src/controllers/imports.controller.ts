import type { Request, Response } from 'express';
import {
  HeaderMappingSchema,
  type CreateImportResponse,
  type JobEvent,
  type JobStatusResponse,
  type PreviewMappingResponse,
} from '@smart-import/shared';
import { loadEnv } from '../config/env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { recordsToCsv } from '../lib/csvExport.js';
import { createProvider } from '../llm/factory.js';
import { parseCsv, type ParsedCsv } from '../services/csvParser.js';
import { mapHeaders } from '../services/headerMapper.js';
import { runImport } from '../services/importPipeline.js';
import { jobStore } from '../services/jobStore.js';

const env = loadEnv();
const provider = createProvider(env);

function resolveParsedCsv(req: Request): ParsedCsv {
  if (req.file) return parseCsv(req.file.buffer);
  const token = typeof req.body?.file_token === 'string' ? req.body.file_token : null;
  if (token) {
    const cached = jobStore.getFile(token);
    if (!cached) {
      throw badRequest('FILE_TOKEN_EXPIRED', 'The uploaded file expired — please upload it again');
    }
    return cached;
  }
  throw badRequest('NO_FILE', 'Attach a CSV file in the "file" field (or a valid file_token)');
}

/** POST /api/imports/preview-mapping — parse + AI header mapping, no row extraction. */
export async function previewMapping(req: Request, res: Response): Promise<void> {
  const parsed = resolveParsedCsv(req);
  const mapping = await mapHeaders(parsed.headers, parsed.rows.slice(0, 10), provider, env);
  const fileToken = jobStore.cacheFile(parsed);

  const body: PreviewMappingResponse = {
    file_token: fileToken,
    headers: parsed.headers,
    sample_rows: parsed.rows.slice(0, 3).map((r) => parsed.headers.map((h) => r.values[h] ?? '')),
    mapping,
    meta: {
      total_rows: parsed.meta.total_rows,
      skipped_junk_rows: parsed.meta.skipped_junk_rows,
      delimiter: parsed.meta.delimiter,
    },
  };
  res.json(body);
}

/** POST /api/imports — kick off the full import job. */
export async function createImport(req: Request, res: Response): Promise<void> {
  const parsed = resolveParsedCsv(req);

  let mapping = null;
  if (typeof req.body?.mapping === 'string' && req.body.mapping.length > 0) {
    const result = HeaderMappingSchema.safeParse(JSON.parse(req.body.mapping));
    if (!result.success) throw badRequest('INVALID_MAPPING', 'The mapping payload is malformed');
    mapping = result.data;
  }

  const job = jobStore.createJob(parsed.meta.total_rows);
  // Fire and forget — progress flows through SSE / polling, not this request.
  void runImport(job, parsed, mapping, { provider, env });

  const body: CreateImportResponse = {
    job_id: job.id,
    total_rows: parsed.meta.total_rows,
    detected_headers: parsed.headers,
  };
  res.status(202).json(body);
}

/** GET /api/imports/:jobId — polling fallback for clients without SSE. */
export function getJob(req: Request, res: Response): void {
  const job = jobStore.getJob(String(req.params.jobId));
  if (!job) throw notFound('JOB_NOT_FOUND', 'Job not found or expired');
  const body: JobStatusResponse = {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
  res.json(body);
}

/** GET /api/imports/:jobId/events — SSE stream of job progress. */
export function streamJobEvents(req: Request, res: Response): void {
  const job = jobStore.getJob(String(req.params.jobId));
  if (!job) throw notFound('JOB_NOT_FOUND', 'Job not found or expired');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // defeat proxy buffering
  });
  res.flushHeaders();

  const send = (event: JobEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  // Late subscribers immediately get the current snapshot.
  send({ type: 'status', status: job.status });
  if (job.mapping) send({ type: 'mapping', mapping: job.mapping });
  if (job.progress.rows_processed > 0) {
    send({ type: 'batch', progress: job.progress, retried: false });
  }
  if (job.status === 'done' && job.result) send({ type: 'done', result: job.result });
  if (job.status === 'failed' && job.error) {
    send({ type: 'error', code: job.error.code, message: job.error.message });
  }

  const listener = (event: JobEvent) => send(event);
  job.emitter.on('event', listener);

  // Heartbeat comment keeps idle proxies from closing the stream.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.emitter.off('event', listener);
  });
}

/** GET /api/imports/:jobId/result.csv — download the imported records. */
export function downloadResultCsv(req: Request, res: Response): void {
  const job = jobStore.getJob(String(req.params.jobId));
  if (!job) throw notFound('JOB_NOT_FOUND', 'Job not found or expired');
  if (job.status !== 'done' || !job.result) {
    throw badRequest('JOB_NOT_DONE', 'The import has not finished yet');
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="groweasy-crm-import.csv"');
  res.send(recordsToCsv(job.result.records));
}
