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
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading workspace data...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-200/40 via-zinc-100/20 to-transparent pointer-events-none"></div>

      <Card className="w-full max-w-md p-8 relative z-10 bg-white/80 backdrop-blur-xl border-zinc-200 shadow-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-zinc-900 text-white rounded-xl flex items-center justify-center text-2xl mx-auto mb-4 shadow-[0_0_20px_rgba(0,0,0,0.1)]">
            {step === 1 ? '👋' : '🚀'}
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">
            {step === 1 ? 'Welcome to AgentFlow' : 'Set up your Workspace'}
          </h1>
          <p className="text-zinc-500 text-sm">
            {step === 1 ? "Let's get to know you first." : "Choose where you want to work."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 ? (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <label className="text-sm font-medium text-zinc-700">What should we call you?</label>
              <Input 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                placeholder="e.g. John Doe"
                required
                autoFocus
                className="bg-zinc-50 border-zinc-200 h-12 text-lg text-zinc-900"
              />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex bg-zinc-100 p-1 rounded-lg mb-6 border border-zinc-200">
                <button 
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${action === 'create' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  onClick={() => setAction('create')}
                >
                  Create New
                </button>
                <button 
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${action === 'join' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  onClick={() => setAction('join')}
                >
                  Join Existing
                </button>
              </div>

              {action === 'create' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Workspace Name</label>
                  <Input 
                    value={orgName} 
                    onChange={e => setOrgName(e.target.value)} 
                    placeholder="My Awesome Workspace"
                    required
                    autoFocus
                    className="bg-zinc-50 border-zinc-200"
                  />
                  <p className="text-xs text-zinc-500 mt-2">You will be the <strong>Owner</strong> of this workspace.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Select Workspace</label>
                  {organizations.length > 0 ? (
                    <>
                      <Select 
                        value={selectedOrgId} 
                        onChange={e => setSelectedOrgId(e.target.value)}
                        className="bg-zinc-50 border-zinc-200"
                      >
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </Select>
                      <p className="text-xs text-zinc-500 mt-2">You will join as a <strong>Viewer</strong> until an Owner promotes you.</p>
                    </>
                  ) : (
                    <p className="text-sm text-rose-600 p-3 bg-rose-50 rounded-lg">No existing workspaces found. Please create one instead.</p>
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
                ← Back
              </Button>
            )}
            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-all" 
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
