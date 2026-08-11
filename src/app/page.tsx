"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useAuthenticationStatus } from "@nhost/react";
import { Hero01 } from "@/components/ui/hero-01";
import { HowItWorks } from "@/components/ui/how-it-works";

export default function Home() {
  const { isAuthenticated } = useAuthenticationStatus();
  
  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden font-sans text-zinc-900">
      
      {/* Floating Navbar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl z-50">
        <div className="bg-white/80 backdrop-blur-xl border border-zinc-200 rounded-full px-6 py-4 flex items-center justify-between shadow-sm">
          <Link href="/" className="flex items-center gap-2 cursor-pointer group">
            <span className="font-bold text-zinc-900 text-2xl tracking-tight transition-colors group-hover:text-indigo-600" style={{ fontFamily: 'cursive' }}>AgentFlow</span>
          </Link>
          
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Link href="/workflows">
                <Button className="rounded-full bg-zinc-900 text-white hover:bg-zinc-800 font-semibold px-6 transition-all">
                  Go to Dashboard
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" className="rounded-full text-zinc-700 font-medium px-4 transition-all">
                    Log In
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button className="rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-6 transition-all">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center pt-24 z-10 w-full">
        <Hero01 />
        <HowItWorks />
      </main>

    </div>
  );
}
