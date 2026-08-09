import React from 'react';
import { RunStatus } from '@/lib/types';

const statusColors: Record<RunStatus | 'default', string> = {
  pending: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  running: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  failed: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  skipped: 'bg-slate-500/20 text-slate-500 border border-slate-500/30 line-through',
  default: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
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
