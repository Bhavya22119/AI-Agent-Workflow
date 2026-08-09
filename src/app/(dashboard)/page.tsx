"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOrg } from '@/hooks/useOrg';
import { useGraphQL } from '@/hooks/useGraphQL';

const DASHBOARD_QUERY = `
  query GetDashboardOverview($orgId: uuid!) {
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      quota_allowed
      quota_used
      quota_remaining
      usage_percentage
      total_runs
      total_workflows
    }
    workflow_runs(limit: 5, order_by: { started_at: desc }) {
      id
      status
      started_at
      workflow {
        name
      }
    }
  }
`;

export default function DashboardPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const { request } = useGraphQL();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    let isMounted = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await request(DASHBOARD_QUERY, { orgId });
        if (isMounted) {
          setData(result);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
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
  }, [orgId, request]);

  if (orgLoading || loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <h1 className="text-3xl font-bold text-white mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <div className="h-4 w-24 bg-slate-800 rounded mb-4"></div>
              <div className="h-8 w-16 bg-slate-800 rounded"></div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="h-6 w-32 bg-slate-800 rounded mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 w-full bg-slate-800 rounded"></div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const summary = data?.org_usage_summary?.[0] || {
    total_workflows: 0,
    total_runs: 0,
    usage_percentage: 0,
    quota_used: 0,
    quota_allowed: 0
  };
  
  const runs = data?.workflow_runs || [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Total Workflows</h3>
          <p className="text-3xl font-bold text-white">{summary.total_workflows}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Total Runs</h3>
          <p className="text-3xl font-bold text-white">{summary.total_runs}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Quota Usage</h3>
          <div className="mt-2 h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-500" 
              style={{ width: `${Math.min(Math.max(summary.usage_percentage, 0), 100)}%` }} 
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {summary.usage_percentage.toFixed(1)}% ({summary.quota_used} / {summary.quota_allowed} runs)
          </p>
        </Card>
      </div>
      
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
        {runs.length === 0 ? (
          <div className="text-slate-400 text-sm">
            No recent activity to show.
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run: any) => (
              <div key={run.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-3">
                  <Badge status={run.status.toLowerCase()} label={run.status} />
                  <span className="text-sm font-medium text-slate-200">
                    {run.workflow?.name || 'Unknown Workflow'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(run.started_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
