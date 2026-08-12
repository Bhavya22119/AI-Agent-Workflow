'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const CONTROL =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-3 transition-colors hover:border-line-strong ' +
  'focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-9.5', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'resize-y leading-relaxed', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL, 'h-9.5 cursor-pointer pr-8', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  help,
  htmlFor,
  children,
  className,
  hint,
}: {
  label?: string;
  help?: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={htmlFor} className="text-xs font-medium tracking-wide text-ink-2 uppercase">
            {label}
          </label>
          {hint}
        </div>
      ) : null}
      {children}
      {help ? <p className="text-xs leading-relaxed text-ink-3">{help}</p> : null}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn('rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.8em] text-ink-2', className)}>
      {children}
    </code>
  );
}
