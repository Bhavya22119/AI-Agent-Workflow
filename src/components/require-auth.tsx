'use client';

/**
 * Client-side gate for the signed-in area.
 *
 * This is a routing convenience, not a security boundary: every page below it
 * reads data through Hasura, which authorises each row against the caller's JWT.
 * Removing this would let someone see an empty shell, not somebody else's data.
 *
 * A signed-in user who belongs to no organization gets the create-organization
 * panel rendered here rather than a redirect — redirecting produced a loader
 * that sat there while the navigation resolved, which looked like a hang.
 */
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CreateOrgPanel } from '@/components/create-org-panel';
import { useAuth } from '@/components/providers/auth-provider';
import { useOrg } from '@/components/providers/org-provider';
import { Alert, PageLoader } from '@/components/ui/feedback';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { memberships, loading, error } = useOrg();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready) return <PageLoader label="Starting up…" />;
  if (!user) return <PageLoader label="Redirecting to sign in…" />;

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert tone="danger" title="Could not load your organizations">
          {error}
        </Alert>
      </div>
    );
  }

  if (loading) return <PageLoader label="Loading your workspace…" />;

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <CreateOrgPanel heading="You are not in an organization yet" />
      </div>
    );
  }

  return <>{children}</>;
}
