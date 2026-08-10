"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spotlight } from "@/components/ui/spotlight";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { 
  Bot, 
  Workflow, 
  Database, 
  Lock,
  Zap,
  ArrowRight
} from "lucide-react";
import { useAuthenticationStatus } from "@nhost/react";
import { Hero01 } from "@/components/ui/hero-01";

export default function Home() {
  const { isAuthenticated } = useAuthenticationStatus();
  
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden font-sans selection:bg-indigo-500/30">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />
      
      {/* Floating Navbar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl z-50">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-full px-6 py-4 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">AgentFlow</span>
          </div>
          
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Link href="/workflows">
                <Button className="rounded-full bg-white text-slate-900 hover:bg-slate-200 font-semibold px-6 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all">
                  Go to Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/onboarding">
                <Button className="rounded-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-6 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all">
                  Get Started
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center mt-32 md:mt-48 px-4 z-10 w-full max-w-7xl mx-auto">
        
        <div className="w-full flex justify-center mb-10 z-10 pt-10">
          <Hero01 />
        </div>

        {/* Features Bento Grid */}
        <div className="w-full pb-32 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
          <BentoGrid className="max-w-5xl mx-auto">
            <BentoGridItem
              title="Visual Workflow Builder"
              description="Connect nodes with an intuitive drag-and-drop interface. No coding required."
              header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/5" />}
              icon={<Workflow className="w-5 h-5" />}
              className="md:col-span-2"
            />
            <BentoGridItem
              title="Seamless Database Writes"
              description="Directly integrate with Hasura to persist your AI's outputs securely."
              header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-white/5" />}
              icon={<Database className="w-5 h-5" />}
              className="md:col-span-1"
            />
            <BentoGridItem
              title="Role-Based Security"
              description="Enterprise-grade permissions. Control who can build, view, and trigger workflows."
              header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 border border-white/5" />}
              icon={<Lock className="w-5 h-5" />}
              className="md:col-span-1"
            />
            <BentoGridItem
              title="Real-time Execution"
              description="Watch your workflows run step-by-step with live polling and human-in-the-loop approvals."
              header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/5" />}
              icon={<Zap className="w-5 h-5" />}
              className="md:col-span-2"
            />
          </BentoGrid>
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
