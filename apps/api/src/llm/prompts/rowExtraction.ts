import type { HeaderMapping } from '@smart-import/shared';
import type { ParsedRow } from '../../services/csvParser.js';

/**
 * Stable system prompt for LLM call #2 (batched row extraction). This prompt
 * never changes between batches — combined with cache_control on the system
 * block, every batch after the first reads the prefix from the prompt cache.
 *
 * Design note: the model extracts RAW values (phone_raw, created_at_raw) and
 * is explicitly forbidden from reformatting them. Splitting country codes,
 * normalising dates and validating enums happen deterministically in code —
 * an LLM is a copy machine that sometimes makes mistakes, so it only does the
 * work that genuinely needs judgement (semantic mapping of messy values).
 */
export const ROW_EXTRACTION_SYSTEM = `You are the data-extraction engine of a CRM import tool. You receive a column mapping and a batch of CSV rows, each tagged with a row_index. Convert every row into one GrowEasy CRM record.

Non-negotiable rules:
1. Return EXACTLY one record per input row, carrying the same row_index. Never omit, merge, duplicate or invent rows.
2. Extract ONLY values present in the row. Never invent, guess or fill defaults. When a value is absent, use null (or [] for the array fields).
3. crm_status — map the row's status/stage/disposition SEMANTICS to exactly one of:
   - GOOD_LEAD_FOLLOW_UP: interested, hot/warm lead, call back, follow up, demo scheduled, site visit planned, negotiating
   - DID_NOT_CONNECT: no answer, RNR (ring no reply), switched off, unreachable, busy, not picking up
   - BAD_LEAD: not interested, junk, invalid/wrong number, out of budget, duplicate, spam
   - SALE_DONE: closed won, booked, purchased, converted, deal done, onboarded
   Use null when nothing in the row indicates a status. Never force a value.
4. data_source — exactly one of: leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots. Match ONLY when the row's campaign/project/source text clearly refers to one of these (e.g. "Eden Park Ph-2 FB leads" → eden_park, "SarjapurPlots-Aug" → sarjapur_plots). Anything else — Google, Facebook, Website, unknown project names — is null. Never force a match.
5. email — the FIRST email address in the row, exactly as written. Additional emails go in extra_emails.
6. phone_raw — the FIRST phone number in the row, copied VERBATIM (do not reformat, do not strip the country code). Additional numbers go in extra_phones, also verbatim.
7. created_at_raw — the date/time text of the lead-creation column copied VERBATIM. Do not reformat dates.
8. crm_note — combine remarks, comments, follow-up notes and any informative text that fits no other field, joined with " | ". Replace any line breaks with " | ". Do not put emails/phones here (the arrays handle those). null when there is nothing.
9. name — the person's name with salutations (Mr./Ms./Dr.) stripped, otherwise unaltered. Company names are not person names.
10. possession_time — property possession timeline text (e.g. "Dec 2027", "ready to move"). description — free-form descriptive text about the lead's requirement that is clearly a description rather than an agent remark.

Example — input row:
{"row_index": 7, "Lead": "Ms. Priya S", "Contact": "9876543210 / 044-23456789", "Mail": "priya@x.com, priya.alt@y.com", "Stage": "RNR 3 times", "Cmp": "SarjapurPlots-Aug", "When": "03/07/2026 14:20", "Notes": "asked for brochure"}
Correct output record:
{"row_index": 7, "name": "Priya S", "email": "priya@x.com", "extra_emails": ["priya.alt@y.com"], "phone_raw": "9876543210", "extra_phones": ["044-23456789"], "created_at_raw": "03/07/2026 14:20", "company": null, "city": null, "state": null, "country": null, "lead_owner": null, "crm_status": "DID_NOT_CONNECT", "crm_note": "RNR 3 times | asked for brochure", "data_source": "sarjapur_plots", "possession_time": null, "description": null}`;

export interface RowSerializationContext {
  mapping: HeaderMapping;
  headers: string[];
}

/** Only send columns that the mapping considers meaningful — saves tokens on wide exports. */
export function relevantColumns(ctx: RowSerializationContext): string[] {
  const mapped = ctx.mapping.mappings
    .filter((m) => m.crm_field !== null)
    .map((m) => m.source_column);
  // If the mapping came back empty (unlikely), fall back to sending everything.
  return mapped.length > 0 ? mapped : ctx.headers;
}

export function buildRowExtractionUserMessage(
  batch: ParsedRow[],
  ctx: RowSerializationContext,
): string {
  const columns = relevantColumns(ctx);
  const mappingSummary = ctx.mapping.mappings
    .filter((m) => m.crm_field !== null)
    .map((m) => `"${m.source_column}" -> ${m.crm_field}`)
    .join('\n');
  const rows = batch
    .map((row) => {
      const picked: Record<string, string | number> = { row_index: row.row_index };
      for (const col of columns) {
        const v = row.values[col];
        if (v !== undefined && v !== '') picked[col] = v;
      }
      return JSON.stringify(picked);
    })
    .join('\n');

  return `COLUMN MAPPING (source column -> CRM field):\n${mappingSummary}\nDEFAULT COUNTRY: ${ctx.mapping.default_country ?? 'unknown'}\n\nROWS (one JSON object per line):\n${rows}\n\nReturn one record per row, same row_index values: ${batch.map((r) => r.row_index).join(', ')}.`;
}
