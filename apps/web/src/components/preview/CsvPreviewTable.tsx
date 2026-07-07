'use client';

import { ArrowLeft, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { VirtualizedTable } from '@/components/common/VirtualizedTable';
import { Button, Card } from '@/components/ui/primitives';
import { formatBytes } from '@/lib/utils';
import { PREVIEW_ROW_LIMIT } from '@/lib/clientCsv';
import { useImportStore } from '@/store/importStore';

export function CsvPreviewTable() {
  const { file, preview, requestingMapping, requestMapping, reset } = useImportStore();
  if (!file || !preview) return null;

  const confirm = () => {
    requestMapping().catch((err: Error) => toast.error(err.message));
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{file.name}</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {formatBytes(file.size)} · {preview.headers.length} columns ·{' '}
            {preview.truncated ? `first ${PREVIEW_ROW_LIMIT} rows shown` : `${preview.rows.length} rows`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={reset}>
            <ArrowLeft className="size-4" aria-hidden />
            Change file
          </Button>
          <Button onClick={confirm} loading={requestingMapping}>
            <Sparkles className="size-4" aria-hidden />
            {requestingMapping ? 'AI reading columns…' : 'Confirm import'}
          </Button>
        </div>
      </Card>

      {preview.skippedJunkRows > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-info-soft px-4 py-2.5 text-sm text-info">
          <Info className="size-4 shrink-0" aria-hidden />
          Skipped {preview.skippedJunkRows} non-data row{preview.skippedJunkRows > 1 ? 's' : ''} above
          the header (report titles, date ranges).
        </div>
      )}

      <VirtualizedTable
        headers={preview.headers}
        rows={preview.rows}
        rowLabel={(row) => preview.rows.indexOf(row) + 1}
        renderCell={(row, col) => row[col] || <span className="text-muted/60">—</span>}
      />

      <p className="text-center text-xs text-muted">
        This preview is parsed entirely in your browser — nothing has been sent to the AI yet.
      </p>
    </div>
  );
}
