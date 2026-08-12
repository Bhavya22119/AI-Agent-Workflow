'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

/**
 * Every variant carries a 1px border, including the filled ones where the border
 * matches the fill. Without it a filled button and an outlined button of the same
 * size are 2px different in height, which is the kind of thing that makes a row of
 * mixed buttons look subtly wrong without anyone being able to say why.
 *
 * `active:translate-y-px` is the only motion: a press should be felt, not watched.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'border border-accent bg-accent text-white shadow-sm shadow-accent/25 hover:border-accent-hover hover:bg-accent-hover disabled:border-accent/50 disabled:bg-accent/50',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-sm shadow-black/[0.03] hover:border-line-strong hover:bg-surface-2',
  ghost: 'border border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger:
    'border border-danger bg-danger text-white shadow-sm shadow-danger/25 hover:brightness-[0.94]',
  success: 'border border-ok bg-ok text-white shadow-sm shadow-ok/25 hover:brightness-[0.94]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'h-9.5 gap-2 rounded-lg px-3.5 text-sm',
  lg: 'h-11 gap-2 rounded-[10px] px-5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,filter,translate] duration-150',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
