"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserData } from '@nhost/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function OnboardingPage() {
  const user = useUserData();
  const router = useRouter();
  
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [action, setAction] = useState<'create' | 'join'>('create');
  const [orgName, setOrgName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  
  useEffect(() => {
    if (user) {
      setOrgName(`${user.email?.split('@')[0]}'s Workspace`);
      if (user.displayName && !user.displayName.includes('@')) {
        setDisplayName(user.displayName);
      }
    }
    
    fetch('/api/organizations')
      .then(res => res.json())
      .then(data => {
        setOrganizations(data);
        if (data.length > 0) setSelectedOrgId(data[0].id);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch orgs', err);
        setLoading(false);
      });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step === 1) {
      if (!displayName.trim()) return alert('Please enter your name');
      setStep(2);
      return;
    }
    
    if (!user) return;
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboard-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          displayName: displayName.trim(),
          action,
          orgName: action === 'create' ? orgName : undefined,
          orgId: action === 'join' ? selectedOrgId : undefined
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      localStorage.setItem('selected_org_id', data.org_id);
      
      // Force reload to let useOrg pick up the new membership
      window.location.href = '/workflows';
    } catch (err: any) {
      alert(err.message || 'Onboarding failed');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading workspace data...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500 to-transparent blur-[80px] rounded-full" />
      </div>

      <Card className="w-full max-w-md p-8 relative z-10 bg-slate-900/80 backdrop-blur-xl border-slate-800">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
            {step === 1 ? '👋' : '🚀'}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {step === 1 ? 'Welcome to AgentFlow' : 'Set up your Workspace'}
          </h1>
          <p className="text-slate-400 text-sm">
            {step === 1 ? "Let's get to know you first." : "Choose where you want to work."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 ? (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <label className="text-sm font-medium text-slate-300">What should we call you?</label>
              <Input 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                placeholder="e.g. John Doe"
                required
                autoFocus
                className="bg-slate-950/50 h-12 text-lg"
              />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex bg-slate-800/50 p-1 rounded-lg mb-6 border border-slate-700/50">
                <button 
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${action === 'create' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                  onClick={() => setAction('create')}
                >
                  Create New
                </button>
                <button 
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${action === 'join' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                  onClick={() => setAction('join')}
                >
                  Join Existing
                </button>
              </div>

              {action === 'create' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Workspace Name</label>
                  <Input 
                    value={orgName} 
                    onChange={e => setOrgName(e.target.value)} 
                    placeholder="My Awesome Workspace"
                    required
                    autoFocus
                    className="bg-slate-950/50"
                  />
                  <p className="text-xs text-slate-500 mt-2">You will be the <strong>Owner</strong> of this workspace.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Select Workspace</label>
                  {organizations.length > 0 ? (
                    <>
                      <Select 
                        value={selectedOrgId} 
                        onChange={e => setSelectedOrgId(e.target.value)}
                        className="bg-slate-950/50"
                      >
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </Select>
                      <p className="text-xs text-slate-500 mt-2">You will join as a <strong>Viewer</strong> until an Owner promotes you.</p>
                    </>
                  ) : (
                    <p className="text-sm text-rose-400 p-3 bg-rose-500/10 rounded-lg">No existing workspaces found. Please create one instead.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            {step === 2 && (
              <Button 
                type="button" 
                variant="secondary"
                className="w-full h-11 text-base font-medium" 
                onClick={() => setStep(1)}
              >
                Back
              </Button>
            )}
            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium shadow-[0_0_15px_rgba(99,102,241,0.2)] hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all" 
              disabled={submitting || (step === 2 && action === 'join' && organizations.length === 0)}
            >
              {step === 1 ? 'Next →' : (submitting ? 'Setting up...' : 'Finish Setup')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
