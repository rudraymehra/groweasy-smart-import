import type { HeaderMapping, RawExtractedRecord } from '@smart-import/shared';
import { describe, expect, it } from 'vitest';
import type { ParsedRow } from '../services/csvParser.js';
import { validateAndNormalize, type PostProcessInput } from '../services/postProcessor.js';

const baseMapping: HeaderMapping = {
  mappings: [],
  date_format: 'DD/MM/YYYY',
  default_country: 'IN',
  header_row_notes: null,
};

const rawRecord = (overrides: Partial<RawExtractedRecord>): RawExtractedRecord => ({
  row_index: 2,
  name: 'Test Person',
  email: null,
  extra_emails: [],
  phone_raw: null,
  extra_phones: [],
  created_at_raw: null,
  company: null,
  city: null,
  state: null,
  country: null,
  lead_owner: null,
  crm_status: null,
  crm_note: null,
  data_source: null,
  possession_time: null,
  description: null,
  ...overrides,
});

const run = (records: RawExtractedRecord[], failed: number[] = []): ReturnType<typeof validateAndNormalize> => {
  const allRows: ParsedRow[] = records.map((r) => ({
    row_index: r.row_index,
    values: { col: `raw row ${r.row_index}` },
  }));
  const input: PostProcessInput = {
    extracted: records,
    failedRowIndexes: failed,
    allRows,
    mapping: baseMapping,
    totalRows: records.length + failed.length,
  };
  return validateAndNormalize(input);
};

describe('validateAndNormalize', () => {
  it('splits phone into country_code + mobile deterministically', () => {
    const result = run([rawRecord({ phone_raw: '+91 98765 43210' })]);
    expect(result.records[0]).toMatchObject({
      country_code: '+91',
      mobile_without_country_code: '9876543210',
    });
  });

  it('keeps the first email and moves extras into crm_note', () => {
    const result = run([
      rawRecord({ email: 'first@x.com', extra_emails: ['second@y.com', 'third@z.com'] }),
    ]);
    expect(result.records[0]!.email).toBe('first@x.com');
    expect(result.records[0]!.crm_note).toContain('Alt email: second@y.com');
    expect(result.records[0]!.crm_note).toContain('Alt email: third@z.com');
  });

  it('keeps the first phone and moves extras into crm_note', () => {
    const result = run([
      rawRecord({ phone_raw: '9876543210', extra_phones: ['9123456780'] }),
    ]);
    expect(result.records[0]!.mobile_without_country_code).toBe('9876543210');
    expect(result.records[0]!.crm_note).toContain('Alt phone: 9123456780');
  });

  it('skips records with neither email nor phone (assignment rule 7)', () => {
    const result = run([rawRecord({ name: 'No Contact' })]);
    expect(result.records).toHaveLength(0);
    expect(result.skipped_rows[0]).toMatchObject({ reason: 'NO_CONTACT_INFO' });
    expect(result.summary.skipped).toBe(1);
  });

  it('falls back to a plausible-but-unvalidated phone rather than losing the lead', () => {
    const result = run([rawRecord({ phone_raw: '99999 88' })]);
    expect(result.records).toHaveLength(1);
    expect(result.warnings.some((w) => w.field === 'mobile_without_country_code')).toBe(true);
  });

  it('drops invalid emails with a warning', () => {
    const result = run([rawRecord({ email: 'not-an-email', phone_raw: '9876543210' })]);
    expect(result.records[0]!.email).toBeNull();
    expect(result.warnings.some((w) => w.field === 'email')).toBe(true);
  });

  it('normalises created_at with the detected column format', () => {
    const result = run([rawRecord({ email: 'a@x.com', created_at_raw: '15/06/2026' })]);
    expect(result.records[0]!.created_at).toBe('2026-06-15');
    expect(Number.isNaN(new Date(result.records[0]!.created_at!).getTime())).toBe(false);
  });

  it('leaves unparseable dates null with a warning instead of guessing', () => {
    const result = run([rawRecord({ email: 'a@x.com', created_at_raw: 'sometime soon' })]);
    expect(result.records[0]!.created_at).toBeNull();
    expect(result.warnings.some((w) => w.field === 'created_at')).toBe(true);
  });

  it('flattens line breaks in crm_note (assignment rule 6)', () => {
    const result = run([rawRecord({ email: 'a@x.com', crm_note: 'line one\nline two\r\nline three' })]);
    expect(result.records[0]!.crm_note).toBe('line one | line two | line three');
  });

  it('dedupes rows sharing an email', () => {
    const result = run([
      rawRecord({ row_index: 2, email: 'same@x.com' }),
      rawRecord({ row_index: 3, email: 'same@x.com' }),
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.skipped_rows[0]).toMatchObject({ row_index: 3, reason: 'DUPLICATE' });
  });

  it('dedupes rows sharing a phone number', () => {
    const result = run([
      rawRecord({ row_index: 2, phone_raw: '9876543210' }),
      rawRecord({ row_index: 3, phone_raw: '+91 9876543210' }),
    ]);
    expect(result.records).toHaveLength(1);
  });

  it('treats email comparison case-insensitively', () => {
    const result = run([
      rawRecord({ row_index: 2, email: 'Same@X.com' }),
      rawRecord({ row_index: 3, email: 'same@x.com' }),
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.email).toBe('same@x.com');
  });

  it('records failed extraction rows and keeps counts consistent', () => {
    const result = run([rawRecord({ email: 'a@x.com' })], [9]);
    expect(result.summary).toMatchObject({ total_rows: 2, parsed: 1, imported: 1, failed: 1 });
    expect(result.skipped_rows.some((s) => s.reason === 'EXTRACTION_FAILED')).toBe(true);
  });

  it('orders records by original row index', () => {
    const result = run([
      rawRecord({ row_index: 5, email: 'b@x.com' }),
      rawRecord({ row_index: 2, email: 'a@x.com' }),
    ]);
    expect(result.records.map((r) => r.row_index)).toEqual([2, 5]);
  });

  it('trims whitespace-only fields to null', () => {
    const result = run([rawRecord({ email: 'a@x.com', company: '   ', city: ' Pune ' })]);
    expect(result.records[0]!.company).toBeNull();
    expect(result.records[0]!.city).toBe('Pune');
  });
});
