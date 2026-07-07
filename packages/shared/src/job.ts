import { z } from 'zod';
import { ImportedRecordSchema } from './crm.js';
import { HeaderMappingSchema } from './mapping.js';

export const JobStatusSchema = z.enum([
  'queued',
  'parsing',
  'mapping',
  'extracting',
  'validating',
  'done',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const SkipReasonSchema = z.enum([
  'NO_CONTACT_INFO',
  'EMPTY_ROW',
  'EXTRACTION_FAILED',
  'DUPLICATE',
]);
export type SkipReason = z.infer<typeof SkipReasonSchema>;

export const SkippedRowSchema = z.strictObject({
  row_index: z.number().int(),
  reason: SkipReasonSchema,
  /** First few raw cell values so users can identify the row. */
  raw_preview: z.string(),
});
export type SkippedRow = z.infer<typeof SkippedRowSchema>;

export const RecordWarningSchema = z.strictObject({
  row_index: z.number().int(),
  field: z.string(),
  message: z.string(),
});
export type RecordWarning = z.infer<typeof RecordWarningSchema>;

export const ImportSummarySchema = z.strictObject({
  /** Data rows found in the CSV (excluding header / junk / fully empty rows). */
  total_rows: z.number().int(),
  /** Rows the AI successfully extracted and that passed validation. */
  parsed: z.number().int(),
  /** Final records imported (= parsed; duplicates are counted in skipped). */
  imported: z.number().int(),
  /** Rows skipped: no contact info, empty, duplicates. */
  skipped: z.number().int(),
  /** Rows lost to AI extraction errors after all retries (target: 0). */
  failed: z.number().int(),
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;

export const ImportResultSchema = z.strictObject({
  summary: ImportSummarySchema,
  records: z.array(ImportedRecordSchema),
  skipped_rows: z.array(SkippedRowSchema),
  warnings: z.array(RecordWarningSchema),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const JobProgressSchema = z.strictObject({
  batches_total: z.number().int(),
  batches_done: z.number().int(),
  rows_processed: z.number().int(),
  rows_total: z.number().int(),
  parsed_so_far: z.number().int(),
  skipped_so_far: z.number().int(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

/** Events emitted over the SSE stream (`event:` name → `data:` payload). */
export type JobEvent =
  | { type: 'status'; status: JobStatus }
  | { type: 'mapping'; mapping: z.infer<typeof HeaderMappingSchema> }
  | { type: 'batch'; progress: JobProgress; retried: boolean }
  | { type: 'done'; result: ImportResult }
  | { type: 'error'; code: string; message: string };
