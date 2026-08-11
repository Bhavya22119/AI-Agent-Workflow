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

    </div>
  );
}
