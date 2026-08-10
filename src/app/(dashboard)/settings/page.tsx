"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/hooks/useOrg";
import { useGraphQL } from "@/hooks/useGraphQL";
import { RunStatus } from "@/lib/types";
import { nhost } from "@/lib/nhost";

interface OrgUsageSummary {
  name: string;
  quota_allowed: number;
  quota_used: number;
  quota_remaining: number;
  usage_percentage: number;
  total_runs: number;
  total_workflows: number;
}

interface OrgMember {
  id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
}

const QUERY = `
  query GetOrgSettings($orgId: uuid!) {
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      name
      quota_allowed
      quota_used
      quota_remaining
      usage_percentage
      total_runs
      total_workflows
    }
    org_members(where: { org_id: { _eq: $orgId } }) {
      id
      user_id
      role
    }
  }
`;

export default function SettingsPage() {
  const { orgId, role, loading: orgLoading } = useOrg();
  const { request } = useGraphQL();
  
  const [summary, setSummary] = useState<OrgUsageSummary | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setError("No organization selected or found.");
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        const data = await request<{
          org_usage_summary: OrgUsageSummary[];
          org_members: OrgMember[];
        }>(QUERY, { orgId });

        if (isMounted) {
          if (data.org_usage_summary && data.org_usage_summary.length > 0) {
            setSummary(data.org_usage_summary[0]);
          }
          if (data.org_members) {
            setMembers(data.org_members);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load organization settings.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [orgId, orgLoading]);

  const getRoleStatus = (r: string): RunStatus | undefined => {
    switch (r) {
      case 'owner': return 'completed';
      case 'editor': return 'running';
      case 'viewer': return 'pending';
      default: return undefined;
    }
  };

  if (orgLoading || loading) {
    return <div className="p-8 text-slate-400">Loading settings...</div>;
  }

  if (error) {
    return <div className="p-8 text-rose-400">Error: {error}</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold text-white mb-8">Organization Settings</h1>
      
      <Card>
        <h2 className="text-xl font-bold text-white mb-6">Organization Details</h2>
        {summary ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-slate-400 mb-1">Organization Name</p>
              <p className="text-lg font-medium text-white">{summary.name}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <p className="text-sm text-slate-400 mb-1">Total Workflows</p>
                <p className="text-2xl font-bold text-white">{summary.total_workflows}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <p className="text-sm text-slate-400 mb-1">Total Runs</p>
                <p className="text-2xl font-bold text-white">{summary.total_runs}</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-sm text-slate-400">Usage Quota</p>
                  <p className="text-sm font-medium text-white">
                    {summary.quota_used} / {summary.quota_allowed} runs used
                  </p>
                </div>
                <span className="text-sm font-bold text-indigo-400">
                  {Math.round(summary.usage_percentage)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5">
                <div 
                  className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, summary.usage_percentage))}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-400">Organization details not available.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-white mb-4">Members</h2>
        <p className="text-sm text-slate-400 mb-6">
          People with access to {summary?.name || 'this organization'}.
        </p>
        
          {role === 'owner' && (
            <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 flex justify-between items-center">
              <p className="text-sm text-indigo-300">
                <span className="font-semibold text-indigo-200">Owner Access:</span> You can change member roles below.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold border border-indigo-500/30">
                    {member.user_id.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white font-mono" title={member.user_id}>
                      {member.user_id.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-slate-400">User ID</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {role === 'owner' ? (
                    <select 
                      className={`text-sm px-3 py-1.5 rounded-md border appearance-none outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                        member.role === 'owner' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        member.role === 'editor' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                        'bg-slate-700/50 text-slate-400 border-slate-600/30'
                      }`}
                      value={member.role}
                      onChange={async (e) => {
                        const newRole = e.target.value;
                        if (!confirm(`Are you sure you want to change this member to ${newRole}?`)) return;
                        
                        try {
                          const user = nhost.auth.getUser();
                          const res = await fetch('/api/manage-members', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'update_role',
                              callerUserId: user?.id,
                              orgId,
                              targetMemberId: member.id,
                              newRole
                            })
                          });
                          
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.message);
                          }
                          
                          // Update local state instantly
                          setMembers(members.map(m => m.id === member.id ? { ...m, role: newRole as any } : m));
                        } catch (err: any) {
                          alert('Failed to update role: ' + err.message);
                        }
                      }}
                    >
                      <option value="owner" className="bg-slate-900 text-white">Owner</option>
                      <option value="editor" className="bg-slate-900 text-white">Editor</option>
                      <option value="viewer" className="bg-slate-900 text-white">Viewer</option>
                    </select>
                  ) : (
                    <Badge 
                      label={member.role.charAt(0).toUpperCase() + member.role.slice(1)} 
                      status={getRoleStatus(member.role)} 
                    />
                  )}
                  
                  {role === 'owner' && (
                    <button 
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                      title="Remove Member"
                      onClick={async () => {
                        if (!confirm('Are you sure you want to remove this member?')) return;
                        try {
                          const user = nhost.auth.getUser();
                          const res = await fetch('/api/manage-members', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'remove_member',
                              callerUserId: user?.id,
                              orgId,
                              targetMemberId: member.id,
                            })
                          });
                          if (!res.ok) throw new Error((await res.json()).message);
                          setMembers(members.filter(m => m.id !== member.id));
                        } catch (err: any) {
                          alert('Failed to remove member: ' + err.message);
                        }
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-4">No members found.</p>
            )}
          </div>
        </Card>
      </div>
    );
  }
