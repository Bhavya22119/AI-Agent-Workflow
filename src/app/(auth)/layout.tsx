import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 px-4 py-10">
      <Link href="/" aria-label="Agent Flow home" className="flex flex-col items-center gap-2.5">
        <Logo priority className="h-12" />
        <p className="text-xs text-ink-3">AI agent workflows, with two layers of permissions</p>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
