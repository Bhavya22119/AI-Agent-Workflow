"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
      workflow_id
      workflow {
        name
      }
    }
  }
`;

export default function DashboardOverviewPage() {
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
        <h1 className="text-3xl font-bold text-zinc-900 mb-6">Dashboard Overview</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <div className="h-4 w-24 bg-zinc-100 rounded mb-4"></div>
              <div className="h-8 w-16 bg-zinc-100 rounded"></div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="h-6 w-32 bg-zinc-100 rounded mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 w-full bg-zinc-100 rounded"></div>
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
    quota_allowed: 100
  };
  
  const runs = data?.workflow_runs || [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-zinc-900">Dashboard Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-sm font-medium text-zinc-500 mb-2">Total Workflows</h3>
          <p className="text-3xl font-bold text-zinc-900">{summary.total_workflows}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-zinc-500 mb-2">Total Runs</h3>
          <p className="text-3xl font-bold text-zinc-900">{summary.total_runs}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-zinc-500 mb-2">Quota Usage</h3>
          <div className="mt-2 h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-500" 
              style={{ width: `${Math.min(Math.max(summary.usage_percentage || 0, 0), 100)}%` }} 
            />
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {(summary.usage_percentage || 0).toFixed(1)}% ({summary.quota_used || 0} / {summary.quota_allowed || 100} runs)
          </p>
        </Card>
      </div>
      
      <Card>
        <h2 className="text-xl font-bold text-zinc-900 mb-4">Recent Activity</h2>
        {runs.length === 0 ? (
          <div className="text-zinc-500 text-sm">
            No recent activity to show.
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run: any) => (
              <Link 
                href={`/workflows/${run.workflow_id}/runs/${run.id}`}
                key={run.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-100/50 border border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Badge status={run.status?.toLowerCase()} label={run.status} />
                  <span className="text-sm font-medium text-zinc-900 group-hover:text-indigo-600 transition-colors">
                    {run.workflow?.name || 'Unknown Workflow'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500">
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                  <svg className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
