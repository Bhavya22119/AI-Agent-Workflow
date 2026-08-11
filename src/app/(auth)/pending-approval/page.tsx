"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@nhost/react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PendingApprovalPage() {
  const { signOut } = useSignOut();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-200/40 via-zinc-100/20 to-transparent pointer-events-none"></div>

      <Card className="w-full max-w-md p-8 relative z-10 bg-white/80 backdrop-blur-xl border-zinc-200 shadow-xl text-center">
        <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm">
          ⏳
        </div>
        
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">Waiting for Approval</h1>
        
        <p className="text-zinc-500 mb-8 leading-relaxed">
          Your request to join the workspace has been sent. You will be able to access the dashboard once the owner approves your request.
        </p>
        
        <Button 
          variant="ghost" 
          className="w-full h-12 font-medium bg-zinc-100 hover:bg-zinc-200"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </Button>
      </Card>
    </div>
  );
}
