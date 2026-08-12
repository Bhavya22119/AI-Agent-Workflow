'use client';

/**
 * Where the sign-up verification link lands.
 *
 * Nhost verifies the ticket and redirects here with a refreshToken, so the user
 * arrives already signed in — the page just confirms it and sends them on,
 * rather than dumping them on a login form wondering whether it worked.
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Card } from '@/components/ui/surface';

export default function VerifiedPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <VerifiedInner />
    </Suspense>
  );
}

function VerifiedInner() {
  const { ready, user, adoptRefreshToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ok' | 'failed'>('checking');
  const [error, setError] = useState<string | null>(null);

  const refreshToken = searchParams.get('refreshToken');
  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function run() {
      if (errorParam) {
        if (!cancelled) {
          setState('failed');
          setError(searchParams.get('errorDescription') ?? errorParam);
        }
        return;
      }
      if (refreshToken) {
        try {
          await adoptRefreshToken(refreshToken);
          if (cancelled) return;
          window.history.replaceState(null, '', '/verified');
          setState('ok');
          setTimeout(() => router.replace('/dashboard'), 1400);
          return;
        } catch (err) {
          if (cancelled) return;
          setState('failed');
          setError(err instanceof Error ? err.message : 'That link is no longer valid.');
          return;
        }
      }
      if (!cancelled) setState(user ? 'ok' : 'failed');
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [ready, refreshToken, errorParam, searchParams, adoptRefreshToken, router, user]);

  if (state === 'checking') return <PageLoader label="Confirming your email…" />;

  if (state === 'failed') {
    return (
      <Card className="p-5">
        <h1 className="text-base font-semibold text-ink">We could not confirm that link</h1>
        <Alert tone="danger" className="mt-4">
          {error ?? 'Verification links can only be used once, and they expire.'}
        </Alert>
        <Link href="/login" className="mt-4 block">
          <Button variant="primary" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <CheckCircle2 className="size-5" />
        </span>
        <div>
          <h1 className="text-base font-semibold text-ink">Email confirmed</h1>
          <p className="mt-1 text-sm text-ink-2">
            You are signed in. Taking you to your workspace…
          </p>
        </div>
      </div>
      <Link href="/dashboard" className="mt-4 block">
        <Button variant="primary" className="w-full">
          Continue
        </Button>
      </Link>
    </Card>
  );
}
