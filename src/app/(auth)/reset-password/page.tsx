'use client';

/**
 * Where the emailed reset link lands.
 *
 * Nhost verifies the ticket on its side and redirects here with a refreshToken
 * in the query string; trading that for a session is what authorises the
 * password change. The token is removed from the URL immediately so it is not
 * left sitting in history or in a copied link.
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Card } from '@/components/ui/surface';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const { user, ready, adoptRefreshToken, changePassword } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const refreshToken = searchParams.get('refreshToken');
  const linkErrorParam = searchParams.get('error');

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function establish() {
      if (linkErrorParam) {
        if (!cancelled) {
          setLinkState('invalid');
          setLinkError(searchParams.get('errorDescription') ?? linkErrorParam);
        }
        return;
      }
      if (refreshToken) {
        try {
          await adoptRefreshToken(refreshToken);
          if (cancelled) return;
          // Do not leave the token in the address bar.
          window.history.replaceState(null, '', '/reset-password');
          setLinkState('ready');
        } catch (err) {
          if (cancelled) return;
          setLinkState('invalid');
          setLinkError(err instanceof Error ? err.message : 'That link is no longer valid.');
        }
        return;
      }
      // No token in the URL: only an already-signed-in user can change a password.
      if (!cancelled) setLinkState(user ? 'ready' : 'invalid');
    }

    void establish();
    return () => {
      cancelled = true;
    };
  }, [ready, refreshToken, linkErrorParam, searchParams, adoptRefreshToken, user]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(password);
      setDone(true);
      setTimeout(() => router.replace('/dashboard'), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || linkState === 'checking') return <PageLoader label="Checking your link…" />;

  if (linkState === 'invalid') {
    return (
      <Card className="p-5">
        <h1 className="text-base font-semibold text-ink">This link cannot be used</h1>
        <Alert tone="danger" className="mt-4">
          {linkError ??
            'Open this page from the reset link in your email — reset links can only be used once, and they expire.'}
        </Alert>
        <Link href="/forgot-password" className="mt-4 block">
          <Button variant="primary" className="w-full">
            Send a new link
          </Button>
        </Link>
        <Link href="/login" className="mt-2 block">
          <Button variant="ghost" className="w-full">
            Back to sign in
          </Button>
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="p-5">
        <h1 className="text-base font-semibold text-ink">Password updated</h1>
        <Alert tone="success" className="mt-4">
          You are signed in. Taking you to your workspace…
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h1 className="text-base font-semibold text-ink">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-3">
        {user?.email ? `For ${user.email}.` : 'Set the password you will use from now on.'}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <Field help="At least 8 characters.">
          <Input
            id="password"
            aria-label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter new password"
          />
        </Field>
        <Field>
          <Input
            id="confirm"
            aria-label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Re-enter new password"
          />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Update password
        </Button>
      </form>
    </Card>
  );
}
