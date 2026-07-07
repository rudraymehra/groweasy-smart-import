'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  RotateCcw,
  SkipForward,
  Table2,
} from 'lucide-react';
import { useState } from 'react';
import {
  CRM_FIELDS,
  type CrmStatus,
  type ImportedRecord,
  type SkipReason,
} from '@smart-import/shared';
import { VirtualizedTable } from '@/components/common/VirtualizedTable';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { resultCsvUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useImportStore } from '@/store/importStore';

const STATUS_TONE: Record<CrmStatus, 'ok' | 'warn' | 'bad' | 'info'> = {
  GOOD_LEAD_FOLLOW_UP: 'ok',
  DID_NOT_CONNECT: 'warn',
  BAD_LEAD: 'bad',
  SALE_DONE: 'info',
};

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  NO_CONTACT_INFO: 'No email or phone',
  EMPTY_ROW: 'Empty row',
  EXTRACTION_FAILED: 'AI extraction failed',
  DUPLICATE: 'Duplicate contact',
};

function renderRecordCell(record: ImportedRecord, col: number) {
  const field = CRM_FIELDS[col]!;
  const value = record[field];
  if (value === null || value === '') return <span className="text-muted/50">—</span>;
  if (field === 'crm_status') {
    return <Badge tone={STATUS_TONE[value as CrmStatus]}>{value}</Badge>;
  }
  if (field === 'data_source') return <Badge tone="pine">{value}</Badge>;
  return value;
}

export function ResultsView() {
  const { result, jobId, reset } = useImportStore();
  const [showSkipped, setShowSkipped] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  if (!result) return null;

  const { summary } = result;
  const stats = [
    { label: 'Successfully parsed', value: summary.parsed, icon: CheckCircle2, tone: 'text-ok' },
    { label: 'Skipped', value: summary.skipped, icon: SkipForward, tone: 'text-warn' },
    { label: 'Total imported', value: summary.imported, icon: Table2, tone: 'text-ember' },
    {
      label: 'Total skipped',
      value: summary.skipped + summary.failed,
      icon: AlertTriangle,
      tone: 'text-muted',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <s.icon className={cn('size-4', s.tone)} aria-hidden />
              {s.label}
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">{s.value}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">of {summary.total_rows} rows</p>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Imported CRM records</h2>
          <p className="mt-0.5 text-sm text-muted">
            Phones split, dates normalised, statuses mapped to GrowEasy values.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            Import another file
          </Button>
          {jobId && (
            <a href={resultCsvUrl(jobId)} download>
              <Button>
                <Download className="size-4" aria-hidden />
                Download CSV
              </Button>
            </a>
          )}
        </div>
      </Card>

      <VirtualizedTable
        headers={[...CRM_FIELDS]}
        rows={result.records}
        rowLabel={(r) => r.row_index}
        renderCell={renderRecordCell}
        columnWidth={170}
      />

      {result.skipped_rows.length > 0 && (
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowSkipped((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-surface-2"
            aria-expanded={showSkipped}
          >
            <span className="flex items-center gap-2">
              <SkipForward className="size-4 text-warn" aria-hidden />
              Skipped rows ({result.skipped_rows.length})
            </span>
            <ChevronDown className={cn('size-4 transition-transform', showSkipped && 'rotate-180')} />
          </button>
          {showSkipped && (
            <div className="divide-y divide-line border-t border-line">
              {result.skipped_rows.map((row) => (
                <div key={row.row_index} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-0.5 font-mono text-[11px] text-muted">row {row.row_index}</span>
                  <Badge tone={row.reason === 'EXTRACTION_FAILED' ? 'bad' : 'warn'}>
                    {SKIP_REASON_LABEL[row.reason]}
                  </Badge>
                  <span className="min-w-0 truncate font-mono text-[11px] text-muted">
                    {row.raw_preview}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {result.warnings.length > 0 && (
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowWarnings((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-surface-2"
            aria-expanded={showWarnings}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warn" aria-hidden />
              Field warnings ({result.warnings.length})
            </span>
            <ChevronDown className={cn('size-4 transition-transform', showWarnings && 'rotate-180')} />
          </button>
          {showWarnings && (
            <div className="divide-y divide-line border-t border-line">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-0.5 font-mono text-[11px] text-muted">row {w.row_index}</span>
                  <Badge tone="neutral">{w.field}</Badge>
                  <span className="min-w-0 font-mono text-[11px] text-muted">{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
