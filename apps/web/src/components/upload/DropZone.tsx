'use client';

import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { toast } from 'sonner';
import { Card } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { useImportStore } from '@/store/importStore';

const SAMPLES = [
  { file: 'google-ads-leads.csv', label: 'Google Ads export' },
  { file: 'real-estate-crm-export.csv', label: 'Real-estate CRM' },
  { file: 'messy-manual-sheet.csv', label: 'Messy manual sheet' },
];

const MAX_SIZE = 20 * 1024 * 1024;

export function DropZone() {
  const selectFile = useImportStore((s) => s.selectFile);
  const parsing = useImportStore((s) => s.parsingPreview);

  const handleFile = useCallback(
    (file: File) => {
      selectFile(file).catch((err: Error) => toast.error(err.message));
    },
    [selectFile],
  );

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      const rejection = rejections[0]?.errors[0];
      if (rejection) {
        toast.error(
          rejection.code === 'file-too-large'
            ? 'That file is over the 20 MB limit.'
            : 'Only .csv files are supported.',
        );
        return;
      }
      if (accepted[0]) handleFile(accepted[0]);
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_SIZE,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
  });

  const loadSample = async (name: string) => {
    try {
      const res = await fetch(`/samples/${name}`);
      const blob = await res.blob();
      handleFile(new File([blob], name, { type: 'text/csv' }));
    } catch {
      toast.error('Could not load the sample file.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card
        {...getRootProps()}
        className={cn(
          'cursor-pointer border-2 border-dashed p-10 text-center transition-all sm:p-14',
          isDragActive
            ? 'border-ember bg-ember-soft/60 scale-[1.01]'
            : 'border-line hover:border-ember/50',
          parsing && 'pointer-events-none opacity-60',
        )}
      >
        <input {...getInputProps()} aria-label="Upload CSV file" />
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-ember-soft">
          <UploadCloud className="size-7 text-ember" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">
          {parsing ? 'Reading your file…' : isDragActive ? 'Drop it here' : 'Drop your CSV file here'}
        </h2>
        <p className="mt-1.5 text-sm text-muted">or click to browse — any column layout works</p>
        <p className="mt-4 font-mono text-xs text-muted">.csv · up to 20 MB</p>
      </Card>

      <div className="mt-6 text-center">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          No file handy? Try a sample
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              onClick={() => loadSample(s.file)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ember/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-ember"
            >
              <FileSpreadsheet className="size-3.5 text-pine" aria-hidden />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
