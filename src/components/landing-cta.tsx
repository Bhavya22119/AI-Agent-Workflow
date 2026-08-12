'use client';

/**
 * The landing page's primary call to action.
 *
 * Isolated into its own client component so the rest of the landing page stays a
 * server component that renders instantly. It shows "Sign in" immediately and
 * swaps to "Open the app" once the browser has read the stored session — never
 * blocking the page on an auth check.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';

export function LandingCta() {
  const { user, ready } = useAuth();
  const signedIn = ready && Boolean(user);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {signedIn ? (
        <>
          <Link href="/dashboard">
            <Button variant="primary" size="lg">
              Open the app
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <span className="text-sm text-ink-3">Signed in as {user?.email}</span>
        </>
      ) : (
        <>
          <Link href="/login">
            <Button variant="primary" size="lg">
              Sign in
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary" size="lg">
              Create an account
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}

export function HeaderCta() {
  const { user, ready } = useAuth();

  if (ready && user) {
    return (
      <Link href="/dashboard" className="text-sm font-medium text-accent hover:underline">
        Open the app →
      </Link>
    );
  }
  return (
    <Link href="/login" className="text-sm font-medium text-accent hover:underline">
      Sign in →
    </Link>
  );
}
