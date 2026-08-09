"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nhost } from '@/lib/nhost';

export default function HomePage() {
  const router = useRouter();
  const [isAuthResolved, setIsAuthResolved] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    async function checkAuth() {
      const isAuth = await nhost.auth.isAuthenticatedAsync();
      if (mounted) {
        setIsAuthResolved(true);
        if (isAuth) router.push('/workflows');
        else router.push('/login');
      }
    }
    
    checkAuth();
    
    return () => { mounted = false; };
  }, [router]);

  return <div className="flex h-screen items-center justify-center text-slate-400">Loading...</div>;
}
