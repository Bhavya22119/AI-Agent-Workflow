"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nhost } from '@/lib/nhost';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      const isAuth = await nhost.auth.isAuthenticatedAsync();
      if (mounted) {
        setIsAuthenticated(isAuth);
        setIsAuthResolved(true);
      }
    }
    checkAuth();
    return () => { mounted = false; };
  }, []);

  if (!isAuthResolved) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      {/* Header */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold">
            W
          </div>
          <span className="font-bold text-xl tracking-tight">AgentFlow</span>
        </div>
        <nav className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link href="/workflows" className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors backdrop-blur-md">
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                Log in
              </Link>
              <Link href="/signup" className="px-5 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-600 text-sm font-medium shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all hover:scale-105 active:scale-95">
                Get Started
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-indigo-300 mb-8 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          The Mini n8n for AI Agents
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
          Automate your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">AI Agents</span><br />
          with powerful workflows.
        </h1>
        
        <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-400 mb-12 leading-relaxed">
          Chain LLM calls, HTTP requests, and human-in-the-loop approvals. Secure multi-tenant architecture designed for production.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href={isAuthenticated ? "/workflows" : "/signup"} className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-slate-950 font-bold text-lg hover:bg-slate-200 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2">
            Start Building Free
            <span className="text-xl">→</span>
          </Link>
          <a href="#features" className="w-full sm:w-auto px-8 py-4 rounded-full bg-white/5 border border-white/10 font-bold text-lg hover:bg-white/10 transition-colors backdrop-blur-md">
            View Features
          </a>
        </div>
      </main>

      {/* Feature Grid */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md hover:bg-white/[0.04] transition-colors">
            <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center text-2xl mb-6">
              🤖
            </div>
            <h3 className="text-xl font-bold mb-3">LLM Integration</h3>
            <p className="text-slate-400">Natively call Llama 3 and other models inside your workflows to process data and make decisions dynamically.</p>
          </div>
          
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md hover:bg-white/[0.04] transition-colors">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center text-2xl mb-6">
              ⏸️
            </div>
            <h3 className="text-xl font-bold mb-3">Human in the Loop</h3>
            <p className="text-slate-400">Pause workflow execution with Approval Gates. Require organization owners or editors to manually approve critical actions.</p>
          </div>
          
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md hover:bg-white/[0.04] transition-colors">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center text-2xl mb-6">
              🔒
            </div>
            <h3 className="text-xl font-bold mb-3">Enterprise Security</h3>
            <p className="text-slate-400">Strict multi-tenancy. Layer 1 row-level security and Layer 2 mid-execution step gating ensures total data isolation.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
