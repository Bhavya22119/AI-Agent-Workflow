'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  children,
  className,
  as: Tag = 'div',
  /** Adds a hover lift. Only for cards that are themselves a link or a target. */
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-line bg-surface shadow-sm shadow-black/[0.02]',
        interactive &&
          'transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-md hover:shadow-black/[0.04]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * The top of a page: title, one line of context, and the primary action.
 *
 * Worth a component rather than markup repeated four times — the pages had drifted
 * to different heading sizes and different gaps, which reads as four screens from
 * four apps.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small label above the title — usually where you are, e.g. the org name. */
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-ink-3">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-3">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface px-4 py-3.5 shadow-sm shadow-black/[0.02]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</p>
        {icon ? <span className="shrink-0 text-ink-3">{icon}</span> : null}
      </div>
      <p className="mt-1.5 text-[22px] leading-none font-semibold tabular-nums text-ink">{value}</p>
      {sub ? <p className="mt-1.5 text-xs leading-snug text-ink-3">{sub}</p> : null}
    </div>
  );
}

/** Scrollable pre block for JSON payloads. */
export function JsonBlock({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <pre
      className={cn(
        'scroll-thin max-h-64 overflow-auto rounded-lg border border-line bg-surface-2 p-3',
        'font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink-2',
        className,
      )}
    >
      {text}
    </pre>
  );
}
