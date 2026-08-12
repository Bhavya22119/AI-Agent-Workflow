'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Card } from '@/components/ui/surface';

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signIn, user, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when the app bounced an unauthenticated visitor here from a deep link.
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(next && next.startsWith('/') ? next : '/dashboard');
  }, [ready, user, router, next]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      <h1 className="text-base font-semibold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink-3">Use one of the seeded demo accounts, or your own.</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        {/* No visible labels: the placeholder names the field. `aria-label` carries
            the accessible name instead — a placeholder is not one, and it also
            disappears the moment there is a value, so a screen reader reading the
            form back would otherwise hit two unnamed boxes. */}
        <Field>
          <Input
            id="email"
            aria-label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter email"
          />
        </Field>
        <Field>
          <Input
            id="password"
            aria-label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
          />
        </Field>

        {/* Was the password label's hint slot; it moves below the input rather
            than being lost with the label. */}
        <div className="-mt-2 flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-accent hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-3">
        No account?{' '}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
    </Card>
  );
}
