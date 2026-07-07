import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { findHeaderRowIndex, parseCsv } from '../services/csvParser.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../../../fixtures', name));

describe('parseCsv', () => {
  it('throws EMPTY_FILE for an empty buffer', () => {
    expect(() => parseCsv(Buffer.from(''))).toThrowError(AppError);
  });

  it('throws EMPTY_FILE for a headers-only file', () => {
    expect(() => parseCsv(Buffer.from('name,email,phone\n'))).toThrow(/no data rows/);
  });

  it('parses a plain comma CSV', () => {
    const parsed = parseCsv(Buffer.from('name,email\nAlice,a@x.com\nBob,b@x.com\n'));
    expect(parsed.headers).toEqual(['name', 'email']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ row_index: 2, values: { name: 'Alice', email: 'a@x.com' } });
  });

  it('skips Google Ads style junk title rows above the header', () => {
    const parsed = parseCsv(fixture('google-ads-leads.csv'));
    expect(parsed.meta.skipped_junk_rows).toBe(2);
    expect(parsed.headers).toContain('Full name');
    expect(parsed.headers).toContain('Email address');
    expect(parsed.rows).toHaveLength(12);
    // Row indexes account for the junk rows: first data row is line 4.
    expect(parsed.rows[0]!.row_index).toBe(4);
  });

  it('handles BOM + semicolon delimiter + latin/unicode headers', () => {
    const parsed = parseCsv(fixture('edge-cases.csv'));
    expect(parsed.meta.delimiter).toBe(';');
    expect(parsed.headers[0]).toBe('Vollständiger Name'); // BOM stripped
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]!.values['E-Mail']).toBe('jose.garcia@empresa.es');
  });

  it('preserves quoted newlines inside cells as one row', () => {
    const csv = 'name,notes\nAlice,"line one\nline two"\n';
    const parsed = parseCsv(Buffer.from(csv));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.values['notes']).toBe('line one\nline two');
  });

  it('drops fully empty rows but keeps original row indexes', () => {
    const parsed = parseCsv(Buffer.from('name,email\nAlice,a@x.com\n,\nBob,b@x.com\n'));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.meta.dropped_empty_rows).toBe(1);
    expect(parsed.rows[1]!.row_index).toBe(4);
  });

  it('dedupes repeated header names', () => {
    const parsed = parseCsv(Buffer.from('phone,phone,name\n1,2,A\n'));
    expect(parsed.headers).toEqual(['phone', 'phone (2)', 'name']);
  });

  it('never emits colliding headers, even for adversarial inputs', () => {
    const parsed = parseCsv(Buffer.from('Email,Email,Email (2)\na@x.com,b@x.com,c@x.com\n'));
    expect(new Set(parsed.headers).size).toBe(3);
    // No column's data may be silently lost to a name collision.
    expect(Object.values(parsed.rows[0]!.values).sort()).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });

  it('strips the BOM even when the latin1 fallback decoding path fires', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const latin1Body = Buffer.from('name,caf\xe9\nAlice,3\n', 'latin1');
    const parsed = parseCsv(Buffer.concat([bom, latin1Body]));
    expect(parsed.headers[0]).toBe('name');
  });

  it('parses tab-delimited files', () => {
    const parsed = parseCsv(Buffer.from('name\temail\nAlice\ta@x.com\n'));
    expect(parsed.meta.delimiter).toBe('\t');
    expect(parsed.rows[0]!.values['email']).toBe('a@x.com');
  });
});

describe('findHeaderRowIndex', () => {
  it('picks row 0 when the file starts with a real header', () => {
    expect(findHeaderRowIndex([['name', 'email'], ['Alice', 'a@x.com']])).toBe(0);
  });

  it('skips a report-title preamble', () => {
    const rows = [
      ['Monthly lead report', ''],
      ['', ''],
      ['Name', 'Email', 'Phone'],
      ['Alice', 'a@x.com', '9876543210'],
    ];
    expect(findHeaderRowIndex(rows)).toBe(2);
  });
});
