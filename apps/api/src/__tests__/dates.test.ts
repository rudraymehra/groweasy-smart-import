import { describe, expect, it } from 'vitest';
import { normalizeDate } from '../lib/dates.js';

/** Every output must satisfy the assignment's rule: new Date(created_at) is valid. */
const expectJsParseable = (value: string | null) => {
  expect(value).not.toBeNull();
  expect(Number.isNaN(new Date(value!).getTime())).toBe(false);
};

describe('normalizeDate', () => {
  it('passes through ISO datetimes', () => {
    const out = normalizeDate('2026-06-03 10:15:22', null);
    expect(out).toBe('2026-06-03 10:15:22');
    expectJsParseable(out);
  });

  it('uses the column-level hint to disambiguate DD/MM', () => {
    // 03/07 is ambiguous — the hint says day-first, so July 3rd.
    expect(normalizeDate('03/07/2026', 'DD/MM/YYYY')).toBe('2026-07-03');
  });

  it('respects an MM/DD hint', () => {
    expect(normalizeDate('03/07/2026', 'MM/DD/YYYY')).toBe('2026-03-07');
  });

  it('defaults ambiguous dates to day-first when no hint exists', () => {
    expect(normalizeDate('15/06/2026', null)).toBe('2026-06-15');
  });

  it('parses month-name formats', () => {
    expect(normalizeDate('4 Jul 2026', null)).toBe('2026-07-04');
    expect(normalizeDate('July 4, 2026', null)).toBe('2026-07-04');
  });

  it('parses two-digit years', () => {
    expect(normalizeDate('6/7/26', 'DD/MM/YY')).toBe('2026-07-06');
  });

  it('converts Excel serial dates', () => {
    const out = normalizeDate('45478', null); // 2024-07-05
    expectJsParseable(out);
    expect(out).toMatch(/^2024-07-0[45]$/);
  });

  it('keeps time components when present', () => {
    const out = normalizeDate('15/06/2026 14:30', 'DD/MM/YYYY HH:mm');
    expect(out).toBe('2026-06-15 14:30:00');
    expectJsParseable(out);
  });

  it('returns null for garbage instead of guessing', () => {
    expect(normalizeDate('next week sometime', null)).toBeNull();
    expect(normalizeDate('N/A', null)).toBeNull();
    expect(normalizeDate('', null)).toBeNull();
  });
});
