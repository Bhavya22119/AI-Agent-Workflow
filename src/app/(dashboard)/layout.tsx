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

  if (!isAuthResolved) return <div className="p-8 text-center text-slate-400">Loading workspace...</div>;
  if (!isAuthenticated) return null; // Wait for redirect

  const navItems = [
    { name: 'Overview', path: '/dashboard' },
    { name: 'Workflows', path: '/workflows' },
    { name: 'Settings', path: '/settings' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            AgentFlow
          </h2>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link key={item.path} href={item.path}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === item.path || pathname.startsWith(item.path) && item.path !== '/dashboard'
                  ? 'bg-indigo-500/10 text-indigo-400' 
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}>
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => signOut()} className="text-sm text-slate-400 hover:text-white transition-colors">
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
