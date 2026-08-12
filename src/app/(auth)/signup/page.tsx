'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { EmailSent } from '@/components/auth/email-sent';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { Card } from '@/components/ui/surface';

export default function SignupPage() {
  const { signUp, signIn, resendVerification } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { needsVerification: pending } = await signUp(email, password, displayName);
      if (pending) {
        // This project's Nhost instance requires email verification, so there is
        // no session yet — say so plainly instead of failing a silent sign-in.
        setNeedsVerification(true);
        return;
      }
      await signIn(email, password);
      router.replace('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that account.');
    } finally {
      setSubmitting(false);
    }
  }

  if (needsVerification) {
    return (
      <Card className="p-5">
        <EmailSent
          email={email}
          title="Confirm your email"
          description="Your account exists, but this project requires a verified address before you can sign in. Click the link and you will come straight back, signed in."
          onResend={() => resendVerification(email)}
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
      <h1 className="text-base font-semibold text-ink">Create an account</h1>
      <p className="mt-1 text-sm text-ink-3">
        You will create or join an organization on the next screen.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Alex Doe"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password" help="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-3">
        Already have one?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
