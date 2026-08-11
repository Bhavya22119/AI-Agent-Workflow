"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { useGraphQL } from "@/hooks/useGraphQL";
import { RunStatus } from "@/lib/types";
import { nhost } from "@/lib/nhost";
import { useUserData } from "@nhost/react";

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
  role: 'owner' | 'editor' | 'viewer' | 'pending';
  user?: {
    displayName: string;
  };
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
  }
`;

export default function SettingsPage() {
  const { orgId, role, loading: orgLoading } = useOrg();
  const { request } = useGraphQL();
  const user = useUserData();
  
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
        const user = nhost.auth.getUser();
        
        // 1. Fetch usage stats via frontend GraphQL
        const data = await request<{
          org_usage_summary: OrgUsageSummary[];
        }>(QUERY, { orgId });

        // 2. Fetch all members via admin API route only if owner
        let membersData = [];
        if (role === 'owner') {
          const membersRes = await fetch(`/api/manage-members?orgId=${orgId}&userId=${user?.id}`);
          if (membersRes.ok) {
            membersData = await membersRes.json();
          }
        }

        if (isMounted) {
          if (data.org_usage_summary && data.org_usage_summary.length > 0) {
            setSummary(data.org_usage_summary[0]);
          }
          if (membersData) {
            setMembers(membersData);
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
  }, [orgId, orgLoading, request]);

  const getRoleStatus = (r: string): RunStatus | undefined => {
    switch (r) {
      case 'owner': return 'completed';
      case 'editor': return 'running';
      case 'viewer': return 'pending';
      case 'pending': return 'paused';
      default: return undefined;
    }
  };

  if (orgLoading || loading) {
    return <div className="p-8 text-zinc-500">Loading settings...</div>;
  }

  if (error) {
    return <div className="p-8 text-rose-400">Error: {error}</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-xl font-bold text-zinc-900 mb-6">Your Profile</h2>
          {user ? (
            <div className="space-y-6">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Name</p>
                <p className="text-lg font-medium text-zinc-900">{user.displayName || 'Unknown User'}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Email</p>
                <p className="text-lg font-medium text-zinc-900">{user.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Your Role in Workspace</p>
                <Badge 
                  label={role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown'} 
                  status={role ? getRoleStatus(role) : undefined} 
                />
              </div>
            </div>
          ) : (
            <p className="text-zinc-500">Profile details not available.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-zinc-900 mb-6">Organization Details</h2>
        {summary ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-zinc-500 mb-1">Organization Name</p>
              <p className="text-lg font-medium text-zinc-900">{summary.name}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-100/50 rounded-lg p-4 border border-zinc-200/50">
                <p className="text-sm text-zinc-500 mb-1">Total Workflows</p>
                <p className="text-2xl font-bold text-zinc-900">{summary.total_workflows}</p>
              </div>
              <div className="bg-zinc-100/50 rounded-lg p-4 border border-zinc-200/50">
                <p className="text-sm text-zinc-500 mb-1">Total Runs</p>
                <p className="text-2xl font-bold text-zinc-900">{summary.total_runs}</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-sm text-zinc-500">Usage Quota</p>
                  <p className="text-sm font-medium text-zinc-900">
                    {summary.quota_used} / {summary.quota_allowed} runs used
                  </p>
                </div>
                <span className="text-sm font-bold text-indigo-600">
                  {Math.round(summary.usage_percentage)}%
                </span>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-2.5">
                <div 
                  className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, summary.usage_percentage))}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500">Organization details not available.</p>
        )}
        </Card>
      </div>

      {role === 'owner' && (
      <Card>
        <h2 className="text-xl font-bold text-zinc-900 mb-4">Members</h2>
        <p className="text-sm text-zinc-500 mb-6">
          People with access to {summary?.name || 'this organization'}.
        </p>
        
          {role === 'owner' && (
            <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 flex justify-between items-center">
              <p className="text-sm text-indigo-700">
                <span className="font-semibold text-indigo-800">Owner Access:</span> You can change member roles below.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 rounded-lg bg-zinc-100/30 border border-zinc-200/50 hover:bg-zinc-100/50 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-700 font-bold border border-indigo-500/30">
                    {(member.user?.displayName || member.user_id).substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{member.user?.displayName || 'Unknown User'}</p>
                    <p className="text-xs text-zinc-500 font-mono" title={member.user_id}>
                      {member.user_id.slice(0, 12)}...
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {role === 'owner' && member.role !== 'owner' ? (
                    <select 
                      className={`text-sm px-3 py-1.5 rounded-md border appearance-none outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                        member.role === 'editor' ? 'bg-blue-500/10 text-blue-600 border-blue-500/30' :
                        'bg-zinc-100/50 text-zinc-500 border-zinc-200/30'
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
                      <option value="owner" className="bg-white text-zinc-900">Owner</option>
                      <option value="editor" className="bg-white text-zinc-900">Editor</option>
                      <option value="viewer" className="bg-white text-zinc-900">Viewer</option>
                      {member.role === 'pending' && <option value="pending" className="bg-white text-amber-600">Pending</option>}
                    </select>
                  ) : (
                    <Badge 
                      label={member.role.charAt(0).toUpperCase() + member.role.slice(1)} 
                      status={getRoleStatus(member.role)} 
                    />
                  )}

                  {role === 'owner' && member.role === 'pending' && (
                    <div className="flex space-x-2 ml-2">
                      <Button 
                        size="sm" 
                        className="bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
                        onClick={async () => {
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
                                newRole: 'viewer'
                              })
                            });
                            if (!res.ok) throw new Error(await res.text());
                            setMembers(members.map(m => m.id === member.id ? { ...m, role: 'viewer' } : m));
                          } catch (err: any) {
                            alert('Failed to approve: ' + err.message);
                          }
                        }}
                      >
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200"
                        onClick={async () => {
                          if (!confirm('Reject this request?')) return;
                          try {
                            const user = nhost.auth.getUser();
                            const res = await fetch('/api/manage-members', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'remove_member',
                                callerUserId: user?.id,
                                orgId,
                                targetMemberId: member.id
                              })
                            });
                            if (!res.ok) throw new Error(await res.text());
                            setMembers(members.filter(m => m.id !== member.id));
                          } catch (err: any) {
                            alert('Failed to reject: ' + err.message);
                          }
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}

                  {role === 'owner' && member.user_id !== nhost.auth.getUser()?.id && member.role !== 'pending' && (
                    <button 
                      className="text-zinc-400 hover:text-rose-500 transition-colors p-2 rounded-md hover:bg-rose-50"
                      title="Remove Member"
                      onClick={async () => {
                        if (!confirm(`Are you sure you want to remove this member from the organization?`)) return;
                        
                        try {
                          const user = nhost.auth.getUser();
                          const res = await fetch('/api/manage-members', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'remove_member',
                              callerUserId: user?.id,
                              orgId,
                              targetMemberId: member.id
                            })
                          });
                          
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.message);
                          }
                          
                          setMembers(members.filter(m => m.id !== member.id));
                        } catch (err: any) {
                          alert('Failed to remove member: ' + err.message);
                        }
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <p className="text-sm text-zinc-500 italic p-4 text-center bg-zinc-50 rounded border border-zinc-100">No members found.</p>
            )}
          </div>
      </Card>
      )}
    </div>
  );
}
