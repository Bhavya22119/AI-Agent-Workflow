'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CreateOrgPanel } from '@/components/create-org-panel';
import { useAuth } from '@/components/providers/auth-provider';
import { PageLoader } from '@/components/ui/feedback';

export default function OnboardingPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready) return <PageLoader />;
  if (!user) return <PageLoader label="Redirecting to sign in…" />;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <CreateOrgPanel />
    </div>
  );
}
