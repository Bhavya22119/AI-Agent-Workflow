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
    ...(role === 'owner' ? [{ name: 'Members', href: '/members' }] : []),
    { name: 'Settings', href: '/settings' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col shadow-sm shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer group">
            <span className="font-bold text-white text-2xl tracking-tight transition-colors group-hover:text-indigo-400" style={{ fontFamily: 'cursive' }}>AgentFlow</span>
          </Link>
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button 
            onClick={async () => {
              await signOut();
              router.push('/login');
            }} 
            className="text-sm text-zinc-400 hover:text-white transition-colors w-full text-left cursor-pointer py-2 px-3 rounded-md hover:bg-zinc-800/50"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-300">
        <div className="container mx-auto p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
