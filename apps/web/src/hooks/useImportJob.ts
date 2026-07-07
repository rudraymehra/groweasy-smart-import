'use client';

import { useEffect, useRef } from 'react';
import type { JobEvent } from '@smart-import/shared';
import { getJob, jobEventsUrl } from '@/lib/api';
import { useImportStore } from '@/store/importStore';

/**
 * Tracks a running import job. Primary transport is SSE; if the stream fails
 * twice (proxy trouble, backend hiccup) it degrades to 2s polling, so progress
 * never silently stalls. The backend job keeps running either way.
 */
export function useImportJob(jobId: string | null, active: boolean): void {
  const failures = useRef(0);

  useEffect(() => {
    if (!jobId || !active) return;

    const store = useImportStore.getState();
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let finished = false;

    const handle = (event: JobEvent) => {
      const s = useImportStore.getState();
      switch (event.type) {
        case 'status':
          s.applyJobStatus(event.status);
          break;
        case 'mapping':
          s.applyMapping(event.mapping);
          break;
        case 'batch':
          s.applyProgress(event.progress, event.retried);
          break;
        case 'done':
          finished = true;
          s.applyResult(event.result);
          cleanup();
          break;
        case 'error':
          finished = true;
          s.applyJobError(event.message);
          cleanup();
          break;
      }
    };

    const startPolling = () => {
      if (pollTimer || finished) return;
      store.pushLog('Live stream unavailable — switched to polling', 'warn');
      pollTimer = setInterval(async () => {
        try {
          const job = await getJob(jobId);
          const s = useImportStore.getState();
          s.applyJobStatus(job.status);
          if (job.progress) s.applyProgress(job.progress, false);
          if (job.status === 'done' && job.result) {
            finished = true;
            s.applyResult(job.result);
            cleanup();
          }
          if (job.status === 'failed' && job.error) {
            finished = true;
            s.applyJobError(job.error.message);
            cleanup();
          }
        } catch {
          // job may have expired; keep trying until unmount
        }
      }, 2000);
    };

    const connect = () => {
      source = new EventSource(jobEventsUrl(jobId));
      const types: JobEvent['type'][] = ['status', 'mapping', 'batch', 'done', 'error'];
      for (const type of types) {
        source.addEventListener(type, (e) => {
          failures.current = 0;
          handle(JSON.parse((e as MessageEvent).data) as JobEvent);
        });
      }
      source.onerror = () => {
        failures.current += 1;
        if (failures.current >= 2) {
          source?.close();
          startPolling();
        }
      };
    };

    const cleanup = () => {
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    connect();
    return cleanup;
  }, [jobId, active]);
}
