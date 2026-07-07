import type { HeaderMapping, RawExtractedRecord } from '@smart-import/shared';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { TruncationError } from '../lib/errors.js';
import type { GenerateStructuredOptions, LLMProvider, LLMResult } from '../llm/provider.js';
import { extractAll } from '../services/batchExtractor.js';
import type { ParsedRow } from '../services/csvParser.js';

const env = {
  BATCH_SIZE: 3,
  MAX_CONCURRENCY: 2,
  EXTRACTION_MODEL: 'mock-model',
  MAPPING_MODEL: 'mock-model',
} as Env;

const mapping: HeaderMapping = {
  mappings: [
    { source_column_index: 0, source_column: 'email', crm_field: 'email', confidence: 'high', notes: null },
  ],
  date_format: null,
  default_country: 'IN',
  header_row_notes: null,
};

const makeRows = (count: number): ParsedRow[] =>
  Array.from({ length: count }, (_, i) => ({
    row_index: i + 2,
    values: { email: `person${i + 2}@x.com` },
  }));

const emptyRecord = (rowIndex: number): RawExtractedRecord => ({
  row_index: rowIndex,
  name: null,
  email: `person${rowIndex}@x.com`,
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
});

/** Extracts the row_index list the extractor asked for from the user prompt. */
const sentIndexes = (user: string): number[] =>
  [...user.matchAll(/"row_index":\s*(\d+)/g)].map((m) => Number(m[1]));

function mockProvider(
  handler: (indexes: number[], callCount: number) => RawExtractedRecord[],
): LLMProvider {
  let calls = 0;
  return {
    name: 'mock',
    async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<LLMResult<T>> {
      calls++;
      const records = handler(sentIndexes(opts.user), calls);
      return { data: { records } as T };
    },
  };
}

describe('extractAll', () => {
  it('extracts every row across multiple batches', async () => {
    const provider = mockProvider((indexes) => indexes.map(emptyRecord));
    const result = await extractAll(makeRows(8), mapping, ['email'], { provider, env });
    expect(result.records).toHaveLength(8);
    expect(result.failed_row_indexes).toEqual([]);
  });

  it('re-queues rows the model silently dropped (reconciliation)', async () => {
    let dropped = false;
    const provider = mockProvider((indexes) => {
      if (!dropped && indexes.length > 1) {
        dropped = true;
        return indexes.slice(1).map(emptyRecord); // drop the first row once
      }
      return indexes.map(emptyRecord);
    });
    const result = await extractAll(makeRows(3), mapping, ['email'], { provider, env });
    expect(result.records).toHaveLength(3);
    expect(result.failed_row_indexes).toEqual([]);
  });

  it('ignores hallucinated and duplicate row indexes', async () => {
    const provider = mockProvider((indexes) => [
      ...indexes.map(emptyRecord),
      emptyRecord(999), // hallucinated row
      emptyRecord(indexes[0]!), // duplicate
    ]);
    const result = await extractAll(makeRows(3), mapping, ['email'], { provider, env });
    expect(result.records).toHaveLength(3);
    expect(result.records.filter((r) => r.row_index === 999)).toHaveLength(0);
  });

  it('bisects a failing batch so one poison row does not kill its neighbours', async () => {
    const POISON = 3;
    const provider = mockProvider((indexes) => {
      if (indexes.includes(POISON)) throw new Error('poison row crashed the model');
      return indexes.map(emptyRecord);
    });
    const result = await extractAll(makeRows(6), mapping, ['email'], { provider, env });
    expect(result.failed_row_indexes).toEqual([POISON]);
    expect(result.records).toHaveLength(5);
  }, 30000);

  it('splits the batch on truncation instead of retrying it verbatim', async () => {
    const provider = mockProvider((indexes) => {
      if (indexes.length > 1) throw new TruncationError();
      return indexes.map(emptyRecord);
    });
    const result = await extractAll(makeRows(4), mapping, ['email'], { provider, env });
    expect(result.records).toHaveLength(4);
    expect(result.failed_row_indexes).toEqual([]);
  });

  it('reports monotonically increasing progress', async () => {
    const snapshots: number[] = [];
    const provider = mockProvider((indexes) => indexes.map(emptyRecord));
    await extractAll(makeRows(9), mapping, ['email'], {
      provider,
      env,
      onProgress: (p) => snapshots.push(p.rows_processed),
    });
    expect(snapshots).toHaveLength(3); // 9 rows / batch size 3
    expect(snapshots[snapshots.length - 1]).toBe(9);
    expect([...snapshots].sort((a, b) => a - b)).toEqual(snapshots);
  });
});
