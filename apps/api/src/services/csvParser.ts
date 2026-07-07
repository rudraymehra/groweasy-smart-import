import Papa from 'papaparse';
import { badRequest } from '../lib/errors.js';

export interface ParsedRow {
  /**
   * 1-based CSV record position counting from the top of the file (header and
   * junk rows included). Equals the physical line number unless a quoted cell
   * contains embedded line breaks.
   */
  row_index: number;
  /** Cell values keyed by header name. */
  values: Record<string, string>;
}

export interface ParsedCsv {
  headers: string[];
  rows: ParsedRow[];
  meta: {
    delimiter: string;
    skipped_junk_rows: number;
    dropped_empty_rows: number;
    total_rows: number;
  };
}

/** Keywords that make a row look like a real header (multi-language exports vary, keep broad). */
const HEADER_KEYWORDS = [
  'name', 'email', 'mail', 'phone', 'mobile', 'contact', 'number', 'date', 'time', 'created',
  'city', 'state', 'country', 'company', 'status', 'source', 'lead', 'owner', 'note', 'remark',
  'comment', 'campaign', 'ad', 'address', 'prospect', 'client', 'customer', 'id', 'stage',
  'assigned', 'possession', 'enquiry', 'inquiry', 'description', 'info',
];

function decodeBuffer(buf: Buffer): string {
  // Strip the UTF-8 BOM at the byte level so it's gone regardless of which
  // decoding path wins below.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }
  // Fall back to latin1 when utf8 decoding produced replacement characters.
  let text = buf.toString('utf8');
  const replacements = (text.match(/�/g) ?? []).length;
  if (replacements > 0 && replacements / Math.max(text.length, 1) > 0.0005) {
    text = buf.toString('latin1');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function isEmptyRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

/**
 * Google Ads and similar exports put 1–3 title/date-range rows above the real
 * header. Score the first few rows and pick the most header-like one.
 */
export function findHeaderRowIndex(rows: string[][]): number {
  const candidates = Math.min(rows.length, 6);
  // Modal column count of the data body tells us how wide real rows are.
  const widthCounts = new Map<number, number>();
  for (const row of rows.slice(0, 50)) {
    const width = row.filter((c) => c.trim() !== '').length;
    if (width > 0) widthCounts.set(width, (widthCounts.get(width) ?? 0) + 1);
  }
  const modalWidth = [...widthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;

  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates; i++) {
    const cells = rows[i]!;
    const nonEmpty = cells.filter((c) => c.trim() !== '');
    if (nonEmpty.length === 0) continue;

    const fillRatio = nonEmpty.length / Math.max(modalWidth, 1);
    const unique = new Set(nonEmpty.map((c) => c.trim().toLowerCase()));
    const uniqueness = unique.size / nonEmpty.length;
    const digitHeavy =
      nonEmpty.filter((c) => /\d{4,}/.test(c) || /^[\d\s\-+/.,:]+$/.test(c.trim())).length /
      nonEmpty.length;
    const keywordHits =
      nonEmpty.filter((c) => {
        const lower = c.trim().toLowerCase();
        return HEADER_KEYWORDS.some((k) => lower.includes(k));
      }).length / nonEmpty.length;

    const score =
      fillRatio * 2 + uniqueness + keywordHits * 4 - digitHeavy * 3 - i * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function dedupeHeaders(raw: string[]): string[] {
  const used = new Set<string>();
  return raw.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    let name = base;
    // Probe until unique — handles pathological inputs like
    // ["Email", "Email", "Email (2)"] without silently colliding.
    for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
    used.add(name);
    return name;
  });
}

export function parseCsv(buffer: Buffer): ParsedCsv {
  if (buffer.length === 0) throw badRequest('EMPTY_FILE', 'The uploaded file is empty');

  // Trailing newlines confuse PapaParse's delimiter guesser (the empty last
  // line makes every delimiter look inconsistent) — strip them up front.
  const text = decodeBuffer(buffer).replace(/[\r\n]+$/, '');
  const result = Papa.parse<string[]>(text, {
    delimiter: '', // auto-detect , ; \t |
    skipEmptyLines: false, // we count empty rows ourselves for accurate row indexes
  });

  const allRows = [...result.data];
  // PapaParse emits a trailing [""] row for files ending in a newline — drop trailing empties.
  while (allRows.length > 0 && isEmptyRow(allRows[allRows.length - 1]!)) allRows.pop();

  if (allRows.length === 0) throw badRequest('EMPTY_FILE', 'The uploaded file has no content');

  const headerIdx = findHeaderRowIndex(allRows);
  const headers = dedupeHeaders(allRows[headerIdx]!);

  const rows: ParsedRow[] = [];
  let droppedEmpty = 0;
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i]!;
    if (isEmptyRow(cells)) {
      droppedEmpty++;
      continue;
    }
    const values: Record<string, string> = {};
    headers.forEach((h, col) => {
      values[h] = (cells[col] ?? '').trim();
    });
    rows.push({ row_index: i + 1, values }); // 1-based, counting from the top of the file
  }

  if (rows.length === 0) {
    throw badRequest('EMPTY_FILE', 'The CSV contains headers but no data rows');
  }

  return {
    headers,
    rows,
    meta: {
      delimiter: result.meta.delimiter ?? ',',
      skipped_junk_rows: headerIdx,
      dropped_empty_rows: droppedEmpty,
      total_rows: rows.length,
    },
  };
}
