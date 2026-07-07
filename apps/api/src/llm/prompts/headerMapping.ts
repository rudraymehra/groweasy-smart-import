import { CRM_FIELD_DEFINITIONS } from '@smart-import/shared';
import type { ParsedRow } from '../../services/csvParser.js';

const FIELD_CATALOG = CRM_FIELD_DEFINITIONS.map((f) => `- ${f.key}: ${f.description}`).join('\n');

/**
 * Stable system prompt for LLM call #1 (header mapping). Kept constant so the
 * prompt cache can serve it; all per-file variability lives in the user message.
 */
export const HEADER_MAPPING_SYSTEM = `You are the column-mapping engine of a CRM import tool. You receive the column headers of an arbitrary CSV file plus up to 10 sample rows, and you map each source column to at most one field of the GrowEasy CRM schema.

CRM fields:
${FIELD_CATALOG}

Rules:
1. Judge each column by BOTH its header text AND its sample values. A column named "Info" whose values are email addresses maps to email. A cryptic header with 10-digit values maps to mobile_without_country_code.
2. Map each CRM field to at most ONE source column — except crm_note: multiple remark/comment/extra-info columns may all map to crm_note.
3. A column containing full phone numbers (with or without country prefix) maps to mobile_without_country_code; a column containing ONLY a dial prefix like "+91" or "91" maps to country_code. Code performs the actual split later.
4. Columns that identify a campaign, project or lead source map to data_source. Columns naming a salesperson/agent/assignee map to lead_owner.
5. Set crm_field to null for columns with no CRM equivalent (internal IDs, scores, currency amounts, ad-platform metrics).
6. Confidence: "high" = header and values both clearly match; "medium" = only one of the two matches; "low" = a plausible guess.
7. date_format: infer the format of the primary date column from the sample values, expressed with dayjs tokens (e.g. "DD/MM/YYYY HH:mm", "YYYY-MM-DD"). A day value greater than 12 anywhere in the samples disambiguates DD/MM vs MM/DD; if truly ambiguous, prefer "DD/MM/YYYY". null when no date column exists.
8. default_country: the ISO-3166 alpha-2 country the phone numbers most likely belong to, judged from phone prefixes, cities, states or country values (e.g. "IN", "US"). null when there is no evidence.
9. Use header_row_notes for anything odd about the file structure worth surfacing to the user.
10. Never invent columns. source_column and source_column_index must come verbatim from the provided headers.`;

export function buildHeaderMappingUserMessage(headers: string[], sampleRows: ParsedRow[]): string {
  const headerList = headers.map((h, i) => `${i}: ${JSON.stringify(h)}`).join('\n');
  const samples = sampleRows
    .slice(0, 10)
    .map((row) => JSON.stringify(headers.map((h) => row.values[h] ?? '')))
    .join('\n');
  return `HEADERS (index: name):\n${headerList}\n\nSAMPLE ROWS (arrays aligned with headers):\n${samples}`;
}
