import type { HeaderMapping } from './mapping.js';
import type { ImportResult, JobProgress, JobStatus } from './job.js';

/** POST /api/imports → 202 */
export interface CreateImportResponse {
  job_id: string;
  total_rows: number;
  detected_headers: string[];
}

/** POST /api/imports/preview-mapping → 200 */
export interface PreviewMappingResponse {
  /** Re-usable handle to the parsed file so the confirm step avoids a re-upload. */
  file_token: string;
  headers: string[];
  sample_rows: string[][];
  mapping: HeaderMapping;
  meta: {
    total_rows: number;
    skipped_junk_rows: number;
    delimiter: string;
  };
}

/** GET /api/imports/:jobId → 200 (polling fallback) */
export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: JobProgress;
  result?: ImportResult;
  error?: { code: string; message: string };
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
