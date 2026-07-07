import { CRM_FIELDS, type ImportedRecord } from '@smart-import/shared';

/**
 * RFC 4180-style escaping: every field quoted, inner quotes doubled.
 * crm_note line breaks were already flattened to " | " during post-processing,
 * so each record is guaranteed to stay a single CSV row.
 */
function escapeField(value: string | null): string {
  if (value === null || value === '') return '';
  const flattened = value.replace(/\r?\n/g, ' | ');
  return `"${flattened.replace(/"/g, '""')}"`;
}

export function recordsToCsv(records: ImportedRecord[]): string {
  const header = CRM_FIELDS.join(',');
  const lines = records.map((record) =>
    CRM_FIELDS.map((field) => escapeField(record[field])).join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}
