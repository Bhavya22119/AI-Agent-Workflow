'use client';

import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A `?` that explains something on hover or focus.
 *
 * Panels should say what a control does, not lecture; anything longer than a
 * few words lives behind one of these instead of taking up permanent space.
 * CSS-only (group-hover / focus-within) so it costs nothing and works with a
 * keyboard.
 */
export function HelpTip({
  children,
  side = 'right',
  className,
}: {
  children: React.ReactNode;
  side?: 'right' | 'left' | 'top';
  className?: string;
}) {
  return (
    <span className={cn('group relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label="Explain this"
        className="rounded-full text-ink-3 transition-colors hover:text-accent focus-visible:text-accent"
      >
        <HelpCircle className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none invisible absolute z-50 w-64 rounded-lg border border-line bg-surface px-2.5 py-2',
          'text-xs leading-relaxed font-normal text-ink-2 normal-case shadow-xl',
          'opacity-0 transition-opacity duration-150',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          side === 'right' && 'top-1/2 left-full ml-2 -translate-y-1/2',
          side === 'left' && 'top-1/2 right-full mr-2 -translate-y-1/2',
          side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
        )}
      >
        {children}
      </span>
    </span>
  );
}
