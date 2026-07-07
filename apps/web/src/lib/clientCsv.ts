import Papa from 'papaparse';

export interface ClientPreview {
  headers: string[];
  rows: string[][];
  skippedJunkRows: number;
  truncated: boolean;
}

export const PREVIEW_ROW_LIMIT = 500;

const HEADER_KEYWORDS = [
  'name', 'email', 'mail', 'phone', 'mobile', 'contact', 'date', 'created', 'city', 'state',
  'country', 'company', 'status', 'source', 'lead', 'owner', 'note', 'remark', 'campaign',
];

/** Lightweight twin of the server's junk-row heuristic, purely for display. */
function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cells = rows[i]!.filter((c) => c.trim() !== '');
    if (cells.length === 0) continue;
    const keywordHits = cells.filter((c) =>
      HEADER_KEYWORDS.some((k) => c.toLowerCase().includes(k)),
    ).length;
    const digitHeavy = cells.filter((c) => /\d{4,}/.test(c)).length;
    const score = cells.length + keywordHits * 4 - digitHeavy * 3 - i * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Incremental client-side parse for the preview step: stops after
 * PREVIEW_ROW_LIMIT + a small margin instead of reading the whole file.
 * No AI is involved here (assignment step 2).
 */
export function parseClientPreview(file: File): Promise<ClientPreview> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      preview: PREVIEW_ROW_LIMIT + 10,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const data = result.data.filter((r) => r.some((c) => c && c.trim() !== ''));
        if (data.length === 0) {
          reject(new Error('This file appears to be empty.'));
          return;
        }
        const headerIdx = findHeaderRow(data);
        const headers = data[headerIdx]!.map((h, i) => h.trim() || `Column ${i + 1}`);
        const rows = data
          .slice(headerIdx + 1, headerIdx + 1 + PREVIEW_ROW_LIMIT)
          .map((r) => headers.map((_, col) => r[col] ?? ''));
        if (rows.length === 0) {
          reject(new Error('This file has headers but no data rows.'));
          return;
        }
        resolve({
          headers,
          rows,
          skippedJunkRows: headerIdx,
          truncated: data.length - headerIdx - 1 >= PREVIEW_ROW_LIMIT,
        });
      },
      error: (err) => reject(new Error(`Could not parse this CSV: ${err.message}`)),
    });
  });
}
