import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import type { HeaderMapping, ImportResult, JobProgress, JobStatus } from '@smart-import/shared';
import type { ParsedCsv } from './csvParser.js';

export interface Job {
  id: string;
  status: JobStatus;
  progress: JobProgress;
  mapping: HeaderMapping | null;
  result: ImportResult | null;
  error: { code: string; message: string } | null;
  createdAt: number;
  emitter: EventEmitter;
}

const JOB_TTL_MS = 30 * 60 * 1000; // results retrievable for 30 min after creation
const FILE_TTL_MS = 10 * 60 * 1000; // parsed files cached 10 min between preview and confirm
const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * In-memory store — a deliberate, documented tradeoff for this project's scale
 * (single instance, short-lived jobs). The interface is small enough that a
 * Redis-backed implementation could replace it without touching the pipeline.
 */
class JobStore {
  private jobs = new Map<string, Job>();
  private files = new Map<string, { parsed: ParsedCsv; createdAt: number }>();
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  createJob(totalRows: number): Job {
    const job: Job = {
      id: `imp_${randomBytes(9).toString('base64url')}`,
      status: 'queued',
      progress: {
        batches_total: 0,
        batches_done: 0,
        rows_processed: 0,
        rows_total: totalRows,
        parsed_so_far: 0,
        skipped_so_far: 0,
      },
      mapping: null,
      result: null,
      error: null,
      createdAt: Date.now(),
      emitter: new EventEmitter(),
    };
    job.emitter.setMaxListeners(50);
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  cacheFile(parsed: ParsedCsv): string {
    const token = `file_${randomBytes(9).toString('base64url')}`;
    this.files.set(token, { parsed, createdAt: Date.now() });
    return token;
  }

  getFile(token: string): ParsedCsv | undefined {
    return this.files.get(token)?.parsed;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (now - job.createdAt > JOB_TTL_MS) {
        job.emitter.removeAllListeners();
        this.jobs.delete(id);
      }
    }
    for (const [token, file] of this.files) {
      if (now - file.createdAt > FILE_TTL_MS) this.files.delete(token);
    }
  }
}

export const jobStore = new JobStore();
