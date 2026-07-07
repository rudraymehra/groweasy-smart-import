'use client';

import { Check, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { JobStatus } from '@smart-import/shared';
import { Button, Card } from '@/components/ui/primitives';
import { useImportJob } from '@/hooks/useImportJob';
import { cn } from '@/lib/utils';
import { useImportStore } from '@/store/importStore';

const STAGES: { key: JobStatus; label: string }[] = [
  { key: 'mapping', label: 'Map columns' },
  { key: 'extracting', label: 'Extract in batches' },
  { key: 'validating', label: 'Validate & normalise' },
];

const STAGE_ORDER: JobStatus[] = ['queued', 'mapping', 'extracting', 'validating', 'done'];

export function ProcessingView() {
  const { jobId, jobStatus, progress, log, error, reset, result } = useImportStore();
  // Stay subscribed until the RESULT arrives (or the job fails) — the 'done'
  // status event precedes the result payload on the same stream.
  useImportJob(jobId, result === null && jobStatus !== 'failed');

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const pct = progress
    ? Math.round((progress.rows_processed / Math.max(progress.rows_total, 1)) * 100)
    : jobStatus === 'validating'
      ? 100
      : 0;
  const currentStageIdx = STAGE_ORDER.indexOf(jobStatus);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {error ? 'Import failed' : 'AI is importing your leads'}
          </h2>
          <span className="font-mono text-sm font-semibold text-ember">{pct}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500', error ? 'bg-bad' : 'bg-ember')}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>

        {progress && (
          <p className="mt-2 font-mono text-xs text-muted">
            batch {progress.batches_done}/{progress.batches_total} · {progress.rows_processed}/
            {progress.rows_total} rows · {progress.parsed_so_far} parsed ·{' '}
            {progress.skipped_so_far} skipped
          </p>
        )}

        <ol className="mt-6 space-y-2.5">
          {STAGES.map((stage) => {
            const stageIdx = STAGE_ORDER.indexOf(stage.key);
            const done = currentStageIdx > stageIdx || jobStatus === 'done';
            const active = jobStatus === stage.key;
            return (
              <li key={stage.key} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full',
                    done && 'bg-ok-soft text-ok',
                    active && 'text-ember',
                    !done && !active && 'text-muted/40',
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  )}
                </span>
                <span className={cn(done || active ? 'text-ink' : 'text-muted')}>{stage.label}</span>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* The pipeline, live: every SSE event lands here as a log line. */}
      <Card className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-4 py-2 font-mono text-[11px] font-medium text-muted">
          import log — live
        </div>
        <div ref={logRef} className="data-scroll max-h-52 space-y-1 overflow-y-auto p-4">
          {log.map((line) => (
            <p
              key={line.id}
              className={cn(
                'font-mono text-[11px] leading-relaxed',
                line.tone === 'info' && 'text-muted',
                line.tone === 'ok' && 'text-ok',
                line.tone === 'warn' && 'text-warn',
                line.tone === 'error' && 'text-bad',
              )}
            >
              {line.text}
            </p>
          ))}
          {log.length === 0 && <p className="font-mono text-[11px] text-muted/60">waiting for events…</p>}
        </div>
      </Card>

      {error && (
        <Card className="flex items-center justify-between gap-3 border-bad/40 p-4">
          <p className="text-sm text-bad">{error}</p>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            Start over
          </Button>
        </Card>
      )}
    </div>
  );
}
