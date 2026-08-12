'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { EmailSent } from '@/components/auth/email-sent';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { Card } from '@/components/ui/surface';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="p-5">
        <EmailSent
          email={email}
          title="Reset link sent"
          description="Open the link in the email and you will land back here to choose a new password."
          onResend={() => requestPasswordReset(email)}
          footer={
            <Link href="/login" className="block">
              <Button variant="ghost" className="w-full">
                Back to sign in
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h1 className="text-base font-semibold text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-3">
        We will email you a link that signs you in so you can set a new one.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-3">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
