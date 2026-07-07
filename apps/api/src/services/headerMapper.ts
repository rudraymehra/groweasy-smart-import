import { HeaderMappingSchema, type HeaderMapping } from '@smart-import/shared';
import type { Env } from '../config/env.js';
import type { LLMProvider } from '../llm/provider.js';
import { HEADER_MAPPING_SYSTEM, buildHeaderMappingUserMessage } from '../llm/prompts/headerMapping.js';
import type { ParsedRow } from './csvParser.js';

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

/**
 * Post-validate the model's mapping: clamp indexes to real columns and enforce
 * the "one source column per CRM field" invariant (crm_note excepted) by
 * keeping the higher-confidence claim.
 */
export function sanitizeMapping(mapping: HeaderMapping, headers: string[]): HeaderMapping {
  const byField = new Map<string, number>(); // crm_field -> index into mappings

  // libphonenumber silently ignores a non-ISO region ("India", "91"), which
  // would disable country-aware phone parsing for the whole file — normalise
  // to a strict alpha-2 code or drop it.
  const country = mapping.default_country?.trim().toUpperCase() ?? null;
  const defaultCountry = country && /^[A-Z]{2}$/.test(country) ? country : null;

  const mappings = headers.map((header, index) => {
    const found =
      mapping.mappings.find((m) => m.source_column_index === index) ??
      mapping.mappings.find((m) => m.source_column === header);
    return (
      found ?? {
        source_column_index: index,
        source_column: header,
        crm_field: null,
        confidence: 'low' as const,
        notes: null,
      }
    );
  });

  const result = mappings.map((m, i) => ({
    ...m,
    source_column_index: i,
    source_column: headers[i]!,
  }));

  for (let i = 0; i < result.length; i++) {
    const field = result[i]!.crm_field;
    if (field === null || field === 'crm_note') continue;
    const existing = byField.get(field);
    if (existing === undefined) {
      byField.set(field, i);
      continue;
    }
    const keepNew =
      CONFIDENCE_RANK[result[i]!.confidence] > CONFIDENCE_RANK[result[existing]!.confidence];
    const loser = keepNew ? existing : i;
    result[loser] = { ...result[loser]!, crm_field: null, notes: 'Duplicate mapping dropped' };
    if (keepNew) byField.set(field, i);
  }

  return { ...mapping, default_country: defaultCountry, mappings: result };
}

export async function mapHeaders(
  headers: string[],
  sampleRows: ParsedRow[],
  provider: LLMProvider,
  env: Env,
): Promise<HeaderMapping> {
  const { data } = await provider.generateStructured({
    model: env.MAPPING_MODEL,
    system: HEADER_MAPPING_SYSTEM,
    user: buildHeaderMappingUserMessage(headers, sampleRows),
    schema: HeaderMappingSchema,
    schemaName: 'header_mapping',
    maxOutputTokens: 4000,
  });
  return sanitizeMapping(data, headers);
}
