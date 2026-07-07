'use client';

import { CsvPreviewTable } from '@/components/preview/CsvPreviewTable';
import { DropZone } from '@/components/upload/DropZone';
import { MappingReview } from '@/components/mapping/MappingReview';
import { ProcessingView } from '@/components/processing/ProcessingView';
import { ResultsView } from '@/components/results/ResultsView';
import { Stepper } from '@/components/stepper/Stepper';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useImportStore } from '@/store/importStore';

export default function Home() {
  const step = useImportStore((s) => s.step);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-ink text-surface">
              <span className="font-mono text-sm font-bold">G</span>
            </div>
            <div>
              <p className="text-sm leading-tight font-bold tracking-tight">GrowEasy</p>
              <p className="font-mono text-[11px] leading-tight text-muted">smart import</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">
        {step === 'upload' && (
          <div className="mx-auto max-w-2xl pt-12 pb-8 text-center sm:pt-16">
            <p className="font-mono text-xs font-medium tracking-widest text-ember uppercase">
              ai-powered csv importer
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Any lead export in. Clean CRM records out.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Google Ads exports, real-estate CRMs, hand-made spreadsheets — the AI reads your
              columns, whatever they are called, and maps every row into GrowEasy CRM format.
            </p>
          </div>
        )}

        <div className={step === 'upload' ? '' : 'py-8'}>
          <Stepper />
        </div>

        <main className="mt-8">
          {step === 'upload' && <DropZone />}
          {step === 'preview' && <CsvPreviewTable />}
          {step === 'mapping' && <MappingReview />}
          {step === 'processing' && <ProcessingView />}
          {step === 'results' && <ResultsView />}
        </main>
      </div>

      <footer className="border-t border-line py-5">
        <p className="text-center font-mono text-[11px] text-muted">
          GrowEasy Smart Import · built for the GrowEasy software developer assignment
        </p>
      </footer>
    </div>
  );
}
