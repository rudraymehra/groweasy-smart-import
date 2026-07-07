'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-ember text-white hover:bg-ember-strong shadow-sm disabled:hover:bg-ember',
    secondary:
      'bg-surface text-ink border border-line hover:bg-surface-2',
    ghost: 'text-muted hover:text-ink hover:bg-surface-2',
    danger: 'bg-bad text-white hover:opacity-90',
  };
  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-line bg-surface shadow-sm', className)}
      {...props}
    />
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'ember' | 'pine';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    info: 'bg-info-soft text-info',
    ember: 'bg-ember-soft text-ember-strong',
    pine: 'bg-pine-soft text-pine',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ember',
        className,
      )}
      {...props}
    />
  );
}
