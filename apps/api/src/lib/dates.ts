import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

/**
 * Formats tried when the column-level hint (from the header-mapping call)
 * is missing or fails. Day-first variants come first: this importer's primary
 * market is India, and column-level format detection has already had its shot.
 */
const FALLBACK_FORMATS = [
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'DD/MM/YYYY HH:mm:ss',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY',
  'DD-MM-YYYY HH:mm',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'MM/DD/YYYY HH:mm:ss',
  'MM/DD/YYYY',
  'D MMM YYYY',
  'D MMMM YYYY',
  'MMM D, YYYY',
  'MMMM D, YYYY',
  'D-MMM-YY',
  'DD/MM/YY',
];

const OUTPUT_WITH_TIME = 'YYYY-MM-DD HH:mm:ss';
const OUTPUT_DATE_ONLY = 'YYYY-MM-DD';

function excelSerialToDate(serial: number): dayjs.Dayjs {
  // Excel day 0 is 1899-12-30 (accounting for the fictional 1900 leap day).
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return dayjs(ms);
}

/**
 * Normalise a raw date string into a value that `new Date(value)` parses —
 * the assignment's explicit requirement for created_at.
 * Returns null when the value cannot be confidently parsed (never guesses).
 */
export function normalizeDate(raw: string, hintFormat: string | null): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Excel serial dates (e.g. "45123") show up in Excel-originated CSVs.
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 20000 && serial < 60000) {
      return excelSerialToDate(serial).format(OUTPUT_DATE_ONLY);
    }
  }

  const hasTime = /\d[:h]\d/.test(value);
  const base = hintFormat ? [hintFormat, ...FALLBACK_FORMATS] : FALLBACK_FORMATS;
  // Relaxed variants ("D/M/YYYY") accept single-digit days/months that strict
  // "DD/MM/YYYY" rejects — real spreadsheets mix "6/7/26" and "06/07/2026".
  const formats = base.flatMap((fmt) => [fmt, fmt.replace(/DD/g, 'D').replace(/MM/g, 'M')]);
  for (const fmt of formats) {
    const parsed = dayjs(value, fmt, true);
    if (parsed.isValid()) {
      return parsed.format(hasTime && fmt.includes('H') ? OUTPUT_WITH_TIME : OUTPUT_DATE_ONLY);
    }
  }

  // Last resort: native parsing handles ISO-with-timezone and RFC formats.
  const native = dayjs(value);
  if (native.isValid() && /\d{4}/.test(value)) {
    return native.format(hasTime ? OUTPUT_WITH_TIME : OUTPUT_DATE_ONLY);
  }
  return null;
}
