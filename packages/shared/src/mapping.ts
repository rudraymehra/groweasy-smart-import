import { z } from 'zod';
import { CrmFieldSchema } from './crm.js';

export const MappingConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type MappingConfidence = z.infer<typeof MappingConfidenceSchema>;

/** One source CSV column mapped (or not) to a CRM field. Produced by LLM call #1. */
export const ColumnMappingSchema = z.strictObject({
  source_column_index: z.number().int(),
  source_column: z.string(),
  crm_field: CrmFieldSchema.nullable(),
  confidence: MappingConfidenceSchema,
  notes: z.string().nullable(),
});

export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

/**
 * The full header-mapping result. `date_format` and `default_country` are
 * column-level inferences applied deterministically to every row afterwards.
 */
export const HeaderMappingSchema = z.strictObject({
  mappings: z.array(ColumnMappingSchema),
  /** e.g. "DD/MM/YYYY", "YYYY-MM-DD HH:mm:ss" — null when no date column exists */
  date_format: z.string().nullable(),
  /** ISO-3166 alpha-2 country the phone numbers most likely belong to, e.g. "IN" */
  default_country: z.string().nullable(),
  header_row_notes: z.string().nullable(),
});

export type HeaderMapping = z.infer<typeof HeaderMappingSchema>;
