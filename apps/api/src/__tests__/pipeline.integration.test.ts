import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HeaderMapping, JobEvent, RawExtractedRecord } from '@smart-import/shared';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import type { GenerateStructuredOptions, LLMProvider, LLMResult } from '../llm/provider.js';
import { parseCsv } from '../services/csvParser.js';
import { runImport } from '../services/importPipeline.js';
import { jobStore } from '../services/jobStore.js';

/**
 * End-to-end pipeline test over the messy fixture with a deterministic mock
 * provider — proves the provider abstraction works and pins the exact summary
 * counts for a file full of edge cases (multi-phones, dupes, junk numbers).
 */

const env = {
  BATCH_SIZE: 4,
  MAX_CONCURRENCY: 2,
  EXTRACTION_MODEL: 'mock-model',
  MAPPING_MODEL: 'mock-model',
} as Env;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /\+?\d[\d\s-]{7,}\d/g;

const mockMapping: HeaderMapping = {
  mappings: [
    { source_column_index: 0, source_column: 'NAME AND DETAILS', crm_field: 'name', confidence: 'medium', notes: null },
    { source_column_index: 1, source_column: 'ph', crm_field: 'mobile_without_country_code', confidence: 'high', notes: null },
    { source_column_index: 2, source_column: 'mail / other mail', crm_field: 'email', confidence: 'high', notes: null },
    { source_column_index: 3, source_column: 'when', crm_field: 'created_at', confidence: 'medium', notes: null },
    { source_column_index: 4, source_column: 'misc notes', crm_field: 'crm_note', confidence: 'medium', notes: null },
  ],
  date_format: 'DD/MM/YYYY',
  default_country: 'IN',
  header_row_notes: null,
};

/** Deterministic stand-in for the extraction model: regex out emails/phones per row. */
class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<LLMResult<T>> {
    if (opts.user.includes('HEADERS (index: name)')) {
      return { data: mockMapping as T };
    }
    const lines = opts.user
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l) as Record<string, string | number>);
    const records: RawExtractedRecord[] = lines.map((row) => {
      const phoneSource = String(row['ph'] ?? '');
      const emailSource = String(row['mail / other mail'] ?? '');
      const phones = phoneSource.match(PHONE_RE)?.map((p) => p.trim()) ?? [];
      const emails = emailSource.match(EMAIL_RE) ?? [];
      return {
        row_index: Number(row['row_index']),
        name: row['NAME AND DETAILS'] ? String(row['NAME AND DETAILS']) : null,
        email: emails[0] ?? null,
        extra_emails: emails.slice(1),
        phone_raw: phones[0] ?? null,
        extra_phones: phones.slice(1),
        created_at_raw: row['when'] ? String(row['when']) : null,
        company: null,
        city: null,
        state: null,
        country: null,
        lead_owner: null,
        crm_status: null,
        crm_note: row['misc notes'] ? String(row['misc notes']) : null,
        data_source: null,
        possession_time: null,
        description: null,
      };
    });
    return { data: { records } as T };
  }
}

describe('import pipeline (integration, mock provider)', () => {
  it('processes the messy fixture end-to-end with exact counts', async () => {
    const buffer = readFileSync(join(import.meta.dirname, '../../../../fixtures/messy-manual-sheet.csv'));
    const parsed = parseCsv(buffer);
    expect(parsed.meta.total_rows).toBe(9);

    const job = jobStore.createJob(parsed.meta.total_rows);
    const events: JobEvent[] = [];
    job.emitter.on('event', (e: JobEvent) => events.push(e));

    await runImport(job, parsed, null, { provider: new MockLLMProvider(), env });

    expect(job.status).toBe('done');
    const result = job.result!;

    // 9 data rows: 7 usable, 1 with no valid contact ("1234"), 1 duplicate of row 2.
    expect(result.summary).toMatchObject({
      total_rows: 9,
      parsed: 7,
      imported: 7,
      skipped: 2,
      failed: 0,
    });
    expect(result.skipped_rows.map((s) => s.reason).sort()).toEqual([
      'DUPLICATE',
      'NO_CONTACT_INFO',
    ]);

    // Multi-phone cell: first phone used, second lands in the note.
    const priya = result.records.find((r) => r.email === 'priya.tcs@gmail.com')!;
    expect(priya.mobile_without_country_code).toBe('9876543210');
    expect(priya.country_code).toBe('+91');
    expect(priya.crm_note).toContain('Alt phone: 9123456780');

    // Multi-email cell: first email used, second in the note.
    const rajesh = result.records.find((r) => r.email === 'rajesh@gmail.com')!;
    expect(rajesh.crm_note).toContain('Alt email: rajesh.backup@yahoo.com');

    // Dates normalised to new Date()-parseable strings.
    for (const record of result.records) {
      if (record.created_at !== null) {
        expect(Number.isNaN(new Date(record.created_at).getTime())).toBe(false);
      }
    }

    // The SSE event stream tells the whole story in order.
    const types = events.map((e) => e.type);
    expect(types).toContain('mapping');
    expect(types).toContain('batch');
    expect(types[types.length - 1]).toBe('done');
  });

  it('marks the job failed when the provider dies on the mapping call', async () => {
    const parsed = parseCsv(Buffer.from('name,email\nAlice,a@x.com\n'));
    const job = jobStore.createJob(1);
    const deadProvider: LLMProvider = {
      name: 'dead',
      generateStructured: async () => {
        throw new Error('API key invalid');
      },
    };
    await runImport(job, parsed, null, { provider: deadProvider, env });
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('IMPORT_FAILED');
  });
});
