import { z } from 'zod';
import { CrmStatusSchema, DataSourceSchema } from './crm.js';

/**
 * What the LLM returns per row in batch extraction (LLM call #2).
 *
 * Deliberately NOT the final CRM record: the LLM extracts raw values
 * (`phone_raw`, `created_at_raw`) and deterministic code performs the
 * phone country-code split, date normalisation and validation afterwards.
 */
export const RawExtractedRecordSchema = z.strictObject({
  row_index: z.number().int(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  extra_emails: z.array(z.string()),
  phone_raw: z.string().nullable(),
  extra_phones: z.array(z.string()),
  created_at_raw: z.string().nullable(),
  company: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  lead_owner: z.string().nullable(),
  crm_status: CrmStatusSchema.nullable(),
  crm_note: z.string().nullable(),
  data_source: DataSourceSchema.nullable(),
  possession_time: z.string().nullable(),
  description: z.string().nullable(),
});

export type RawExtractedRecord = z.infer<typeof RawExtractedRecordSchema>;

export const BatchExtractionResponseSchema = z.strictObject({
  records: z.array(RawExtractedRecordSchema),
});

export type BatchExtractionResponse = z.infer<typeof BatchExtractionResponseSchema>;
