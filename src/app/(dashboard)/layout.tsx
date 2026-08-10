"use client";
import { useAuthenticationStatus, useSignOut } from '@nhost/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nhost } from '@/lib/nhost';

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

  if (!isAuthResolved) return <div className="p-8 text-center text-zinc-500">Loading workspace...</div>;
  if (!isAuthenticated) return null; // Wait for redirect

  const navigation = [
    { name: 'Overview', href: '/dashboard' },
    { name: 'Workflows', href: '/workflows' },
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
