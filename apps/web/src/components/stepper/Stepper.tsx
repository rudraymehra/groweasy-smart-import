'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImportStore, type WizardStep } from '@/store/importStore';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Preview' },
  { key: 'mapping', label: 'Review mapping' },
  { key: 'processing', label: 'AI import' },
  { key: 'results', label: 'Results' },
];

export function Stepper() {
  const step = useImportStore((s) => s.step);
  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <nav aria-label="Import progress" className="mx-auto w-full max-w-3xl px-4">
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={s.key} className={cn('flex items-center', i > 0 && 'flex-1')}>
              {i > 0 && (
                <div
                  aria-hidden
                  className={cn('mx-2 h-px flex-1 sm:mx-3', done || current ? 'bg-ember' : 'bg-line')}
                />
              )}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-colors',
                    done && 'bg-ember text-white',
                    current && 'bg-ember text-white ring-4 ring-ember/20',
                    !done && !current && 'border border-line bg-surface text-muted',
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </div>
                <span
                  className={cn(
                    'hidden text-xs sm:block',
                    current ? 'font-semibold text-ink' : 'text-muted',
                  )}
                >
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
