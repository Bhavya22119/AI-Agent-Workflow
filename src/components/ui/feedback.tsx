'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { wrap: string; icon: ReactNode }> = {
  info: { wrap: 'bg-info-soft text-info border-info/25', icon: <Info className="size-4" /> },
  success: {
    wrap: 'bg-ok-soft text-ok border-ok/25',
    icon: <CheckCircle2 className="size-4" />,
  },
  warning: {
    wrap: 'bg-warn-soft text-warn border-warn/25',
    icon: <AlertTriangle className="size-4" />,
  },
  danger: { wrap: 'bg-danger-soft text-danger border-danger/25', icon: <XCircle className="size-4" /> },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const config = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm', config.wrap, className)}
    >
      <span className="mt-0.5 shrink-0">{config.icon}</span>
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="leading-relaxed break-words opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-ink-3', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </div>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}
