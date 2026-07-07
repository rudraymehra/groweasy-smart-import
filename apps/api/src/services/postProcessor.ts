import {
  CRM_STATUS_VALUES,
  DATA_SOURCE_VALUES,
  type HeaderMapping,
  type ImportResult,
  type ImportedRecord,
  type RawExtractedRecord,
  type RecordWarning,
  type SkippedRow,
} from '@smart-import/shared';
import { normalizeDate } from '../lib/dates.js';
import { splitPhone } from '../lib/phone.js';
import type { ParsedRow } from './csvParser.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v: string | null): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Flatten line breaks so every record stays a single CSV row (assignment rule 6). */
const flattenNote = (v: string): string => v.replace(/\r?\n/g, ' | ').replace(/\s*\|\s*/g, ' | ').trim();

function appendNote(existing: string | null, addition: string): string {
  return existing ? `${existing} | ${addition}` : addition;
}

export interface PostProcessInput {
  extracted: RawExtractedRecord[];
  failedRowIndexes: number[];
  allRows: ParsedRow[];
  mapping: HeaderMapping;
  totalRows: number;
}

/**
 * The deterministic half of the pipeline. Everything the LLM returned is
 * re-validated here: emails against a regex, phones via libphonenumber,
 * dates against the detected column format, enums against the allowed values.
 * The LLM proposes; this code disposes.
 */
export function validateAndNormalize(input: PostProcessInput): ImportResult {
  const { extracted, failedRowIndexes, allRows, mapping, totalRows } = input;
  const rowByIndex = new Map(allRows.map((r) => [r.row_index, r]));
  const records: ImportedRecord[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: RecordWarning[] = [];
  const seenContacts = new Map<string, number>(); // dedupe key -> first row_index

  const rawPreview = (rowIndex: number): string => {
    const row = rowByIndex.get(rowIndex);
    if (!row) return '';
    return Object.values(row.values).filter(Boolean).slice(0, 4).join(' · ').slice(0, 120);
  };

  const sorted = [...extracted].sort((a, b) => a.row_index - b.row_index);

  for (const raw of sorted) {
    const warn = (field: string, message: string) =>
      warnings.push({ row_index: raw.row_index, field, message });

    let note = raw.crm_note ? flattenNote(raw.crm_note) : null;

    // --- Email: first valid one wins, the rest are preserved in the note.
    const emailCandidates = [raw.email, ...raw.extra_emails]
      .map((e) => clean(e)?.toLowerCase() ?? null)
      .filter((e): e is string => e !== null);
    const validEmails = emailCandidates.filter((e) => EMAIL_RE.test(e));
    const email = validEmails[0] ?? null;
    if (emailCandidates.length > 0 && validEmails.length === 0) {
      warn('email', `Invalid email dropped: "${emailCandidates[0]}"`);
    }
    for (const extra of validEmails.slice(1)) note = appendNote(note, `Alt email: ${extra}`);

    // --- Phone: LLM extracts raw strings; libphonenumber does the split.
    const phoneCandidates = [raw.phone_raw, ...raw.extra_phones]
      .map(clean)
      .filter((p): p is string => p !== null);
    let countryCode: string | null = null;
    let mobile: string | null = null;
    const extraPhones: string[] = [];
    for (const candidate of phoneCandidates) {
      const split = splitPhone(candidate, mapping.default_country);
      if (!split) {
        warn('mobile_without_country_code', `Unparseable phone dropped: "${candidate}"`);
        continue;
      }
      if (mobile === null) {
        countryCode = split.country_code;
        mobile = split.mobile;
        if (!split.valid) {
          warn('mobile_without_country_code', `Phone "${candidate}" kept but could not be validated`);
        }
      } else {
        extraPhones.push(candidate);
      }
    }
    for (const extra of extraPhones) note = appendNote(note, `Alt phone: ${extra}`);

    // --- Skip rule (assignment rule 7): no email AND no mobile → skip.
    if (email === null && mobile === null) {
      skipped.push({
        row_index: raw.row_index,
        reason: 'NO_CONTACT_INFO',
        raw_preview: rawPreview(raw.row_index),
      });
      continue;
    }

    // --- Dedupe within the file on email or phone. Keyed by national digits
    // only, so "+91 98765..." and its unvalidated bare-digit twin still match.
    const dedupeKeys = [email, mobile].filter((k): k is string => k !== null);
    const duplicateOf = dedupeKeys.map((k) => seenContacts.get(k)).find((v) => v !== undefined);
    if (duplicateOf !== undefined) {
      skipped.push({
        row_index: raw.row_index,
        reason: 'DUPLICATE',
        raw_preview: `Same contact as row ${duplicateOf} · ${rawPreview(raw.row_index)}`,
      });
      continue;
    }
    for (const key of dedupeKeys) seenContacts.set(key, raw.row_index);

    // --- Date: normalise with the column-level format detected during mapping.
    let createdAt: string | null = null;
    if (raw.created_at_raw) {
      createdAt = normalizeDate(raw.created_at_raw, mapping.date_format);
      if (createdAt === null) {
        warn('created_at', `Unparseable date left blank: "${raw.created_at_raw}"`);
      } else if (Number.isNaN(new Date(createdAt).getTime())) {
        // Assignment rule 3: created_at must survive new Date(created_at).
        warn('created_at', `Normalised date failed new Date() check: "${createdAt}"`);
        createdAt = null;
      }
    }

    // --- Enums: constrained decoding already guarantees these, but the provider
    // is swappable and this module is pure — belt and braces.
    let crmStatus = raw.crm_status;
    if (crmStatus !== null && !CRM_STATUS_VALUES.includes(crmStatus)) {
      warn('crm_status', `Invalid status "${crmStatus}" cleared`);
      crmStatus = null;
    }
    let dataSource = raw.data_source;
    if (dataSource !== null && !DATA_SOURCE_VALUES.includes(dataSource)) {
      warn('data_source', `Invalid data source "${dataSource}" cleared`);
      dataSource = null;
    }

    records.push({
      row_index: raw.row_index,
      created_at: createdAt,
      name: clean(raw.name),
      email,
      country_code: countryCode,
      mobile_without_country_code: mobile,
      company: clean(raw.company),
      city: clean(raw.city),
      state: clean(raw.state),
      country: clean(raw.country),
      lead_owner: clean(raw.lead_owner),
      crm_status: crmStatus,
      crm_note: note ? flattenNote(note) : null,
      data_source: dataSource,
      possession_time: clean(raw.possession_time),
      description: clean(raw.description),
    });
  }

  for (const rowIndex of failedRowIndexes) {
    skipped.push({
      row_index: rowIndex,
      reason: 'EXTRACTION_FAILED',
      raw_preview: rawPreview(rowIndex),
    });
  }
  skipped.sort((a, b) => a.row_index - b.row_index);

  return {
    summary: {
      total_rows: totalRows,
      parsed: records.length,
      imported: records.length,
      skipped: skipped.filter((s) => s.reason !== 'EXTRACTION_FAILED').length,
      failed: failedRowIndexes.length,
    },
    records,
    skipped_rows: skipped,
    warnings,
  };
}
