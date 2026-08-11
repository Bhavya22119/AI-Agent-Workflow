"use client";
import { useAuthenticationStatus, useSignOut } from '@nhost/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nhost } from '@/lib/nhost';
import { useOrg } from '@/hooks/useOrg';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useSignOut();
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    async function checkAuth() {
      // Wait for Nhost to finish its initial token check from localStorage
      const isAuth = await nhost.auth.isAuthenticatedAsync();
      if (mounted) {
        setIsAuthenticated(isAuth);
        setIsAuthResolved(true);
        if (!isAuth) {
          router.push('/login');
        }
      }
    }
    
    checkAuth();
    
    return () => { mounted = false; };
  }, [router]);

  const { role, loading: orgLoading } = useOrg();

  if (!isAuthResolved || orgLoading) return <div className="p-8 text-center text-zinc-500">Loading workspace...</div>;
  if (!isAuthenticated) return null; // Wait for redirect

  if (role === 'pending') {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="max-w-md p-8 bg-white border border-zinc-200 rounded-xl shadow-sm text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">⏳</div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Approval Pending</h1>
          <p className="text-zinc-600 mb-6">Your request to join the organization has been sent. Please wait for an Owner to approve your request.</p>
          <Button onClick={() => signOut()} variant="ghost" className="w-full border border-zinc-200">Sign Out</Button>
        </div>
      </div>
    );
  }

  const navigation = [
    { name: 'Overview', href: '/dashboard' },
    { name: 'Workflows', href: '/workflows' },
    { name: 'Members', href: '/members' },
    { name: 'Settings', href: '/settings' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <aside className="w-64 border-r border-zinc-200 bg-white flex flex-col shadow-sm">
        <div className="h-16 flex items-center px-6 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
              <span className="text-white font-bold">🤖</span>
            </div>
            <span className="font-bold text-zinc-900 tracking-tight">AgentFlow</span>
          </div>
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                  ? 'bg-zinc-100 text-zinc-900 shadow-sm' 
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-zinc-200">
          <button onClick={() => signOut()} className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
