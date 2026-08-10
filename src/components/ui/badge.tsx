import React from 'react';
import { RunStatus } from '@/lib/types';

const statusColors: Record<RunStatus | 'default', string> = {
  pending: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  running: 'bg-blue-50 text-blue-700 border border-blue-200',
  paused: 'bg-amber-50 text-amber-700 border border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
  skipped: 'bg-zinc-100 text-zinc-500 border border-zinc-200 line-through',
  default: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

export function Badge({ status, label, className = '' }: { status?: RunStatus, label: string, className?: string }) {
  const colorClass = status ? statusColors[status] : statusColors.default;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}>
      {status === 'running' && <span className="w-2 h-2 mr-1.5 rounded-full bg-blue-400 animate-pulse-ring" />}
      {label}
    </span>
  );
}
