'use client';

import { ArrowLeft, ArrowRight, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  CRM_FIELD_DEFINITIONS,
  type CrmField,
  type MappingConfidence,
} from '@smart-import/shared';
import { Badge, Button, Card, Select } from '@/components/ui/primitives';
import { useImportStore } from '@/store/importStore';

const CONFIDENCE_TONE: Record<MappingConfidence, 'ok' | 'warn' | 'bad'> = {
  high: 'ok',
  medium: 'warn',
  low: 'bad',
};

export function MappingReview() {
  const { mappingData, mapping, overrideMapping, startImport, reset } = useImportStore();
  const setStep = useImportStore.setState;
  if (!mappingData || !mapping) return null;

  const sampleFor = (columnIndex: number): string => {
    const values = mappingData.sample_rows
      .map((row) => row[columnIndex])
      .filter((v): v is string => Boolean(v && v.trim()));
    return values.slice(0, 2).join('  ·  ');
  };

  const mappedFields = new Set(
    mapping.mappings.map((m) => m.crm_field).filter((f) => f !== null),
  );
  const unmapped = CRM_FIELD_DEFINITIONS.filter((f) => !mappedFields.has(f.key));

  const begin = () => {
    startImport().catch((err: Error) => toast.error(err.message));
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Review the AI column mapping</h2>
            <p className="mt-0.5 text-sm text-muted">
              The AI read your headers and sample values. Adjust anything before the import runs.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setStep({ step: 'preview' })}>
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
            <Button onClick={begin}>
              Start import
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        {mapping.header_row_notes && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            AI note: {mapping.header_row_notes}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
          <span>rows: {mappingData.meta.total_rows}</span>
          {mapping.date_format && <span>date format: {mapping.date_format}</span>}
          {mapping.default_country && <span>phone region: {mapping.default_country}</span>}
        </div>
      </Card>

      <Card className="divide-y divide-line overflow-hidden">
        {mapping.mappings.map((m) => (
          <div
            key={m.source_column_index}
            className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{m.source_column}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                {sampleFor(m.source_column_index) || 'no sample values'}
              </p>
            </div>
            <MoveRight className="hidden size-4 text-muted/50 sm:block" aria-hidden />
            <Select
              aria-label={`CRM field for column ${m.source_column}`}
              value={m.crm_field ?? ''}
              onChange={(e) =>
                overrideMapping(
                  m.source_column_index,
                  e.target.value === '' ? null : (e.target.value as CrmField),
                )
              }
            >
              <option value="">Ignore this column</option>
              {CRM_FIELD_DEFINITIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.key})
                </option>
              ))}
            </Select>
            <div className="justify-self-start sm:justify-self-end">
              {m.crm_field === null ? (
                <Badge tone="neutral">ignored</Badge>
              ) : (
                <Badge tone={CONFIDENCE_TONE[m.confidence]}>{m.confidence}</Badge>
              )}
            </div>
          </div>
        ))}
      </Card>

      {unmapped.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            CRM fields with no source column
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unmapped.map((f) => (
              <Badge key={f.key} tone="neutral">
                {f.key}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="text-center">
        <button onClick={reset} className="text-xs text-muted underline-offset-2 hover:underline">
          Cancel and start over
        </button>
      </div>
    </div>
  );
}
