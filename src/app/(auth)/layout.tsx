import { Workflow } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-accent text-white">
          <Workflow className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Agent Flow</p>
          <p className="text-xs text-ink-3">AI agent workflows, with two layers of permissions</p>
        </div>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
