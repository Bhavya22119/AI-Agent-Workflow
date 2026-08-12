'use client';

/**
 * Where the sign-up verification link lands.
 *
 * Nhost verifies the ticket and redirects here with a refreshToken, so the user
 * arrives already signed in — the page just confirms it and sends them on,
 * rather than dumping them on a login form wondering whether it worked.
 *
 * ---------------------------------------------------------------------------
 *  The single-use token
 * ---------------------------------------------------------------------------
 *  Nhost rotates a refresh token on every use, so the one in the link works
 *  exactly once. An earlier version of this page had `user` in the effect's
 *  dependency list, which meant a *successful* exchange changed the session,
 *  re-ran the effect, and the second call was refused — and that refusal
 *  overwrote the success. The symptom was "Invalid or expired refresh token" on
 *  a link created seconds earlier.
 *
 *  So the exchange is keyed on the token and attempted exactly once, and the
 *  outcome is stored per token rather than as a free-floating status.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { nhost } from '@/lib/nhost';
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

/** The result of trading one specific token for a session. */
type Exchange = { token: string; ok: boolean; error?: string };

function VerifiedInner() {
  const { ready, user, adoptRefreshToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [exchange, setExchange] = useState<Exchange | null>(null);

  const refreshToken = searchParams.get('refreshToken');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('errorDescription');

  /** Tokens already sent to the server, so none is ever spent twice. */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    // Only the exchange needs an effect. Everything else about this page is a
    // function of the URL and the session, and is derived below.
    if (!ready || errorParam || !refreshToken) return;
    if (attempted.current === refreshToken) return;
    attempted.current = refreshToken;

    let cancelled = false;

    adoptRefreshToken(refreshToken)
      .then(() => {
        if (!cancelled) setExchange({ token: refreshToken, ok: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // The SDK can adopt the token from the URL while initialising, which
        // leaves this explicit exchange to be refused even though we are signed
        // in. A session in hand outranks the error.
        if (nhost.getUserSession()) {
          setExchange({ token: refreshToken, ok: true });
          return;
        }
        setExchange({
          token: refreshToken,
          ok: false,
          error: err instanceof Error ? err.message : 'That link is no longer valid.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [ready, refreshToken, errorParam, adoptRefreshToken]);

  const result = exchange?.token === refreshToken ? exchange : null;

  // Derived, not stored: three shapes of arrival — the link carried an error, it
  // carried a token, or it carried nothing and we fall back to the session.
  const state: 'checking' | 'ok' | 'failed' = errorParam
    ? 'failed'
    : refreshToken
      ? (result ? (result.ok ? 'ok' : 'failed') : 'checking')
      : !ready
        ? 'checking'
        : user
          ? 'ok'
          : 'failed';

  const message = errorParam ? (errorDescription ?? errorParam) : (result?.error ?? null);

  // Cleaning the token out of the URL and moving on are effects of having
  // succeeded, so they belong here rather than in the exchange callback.
  useEffect(() => {
    if (state !== 'ok') return;
    if (refreshToken) window.history.replaceState(null, '', '/verified');
    const timer = setTimeout(() => router.replace('/dashboard'), 1200);
    return () => clearTimeout(timer);
  }, [state, refreshToken, router]);

  if (state === 'checking') return <PageLoader label="Confirming your email…" />;

  if (state === 'failed') {
    return (
      <Card className="p-5">
        <h1 className="text-base font-semibold text-ink">We could not confirm that link</h1>
        <Alert tone="danger" className="mt-4">
          {message ?? 'Verification links can only be used once, and they expire.'}
        </Alert>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">
          If you have already opened this link once, your email is very likely confirmed
          already — try signing in.
        </p>
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
