"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticationStatus } from '@nhost/react';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthenticationStatus();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) router.push('/workflows');
      else router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return <div className="flex h-screen items-center justify-center">Loading...</div>;
}
