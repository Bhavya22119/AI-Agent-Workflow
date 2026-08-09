"use client";
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrg } from '@/hooks/useOrg';

import { useState, useEffect } from 'react';
import { useGraphQL } from '@/hooks/useGraphQL';

export default function WorkflowsPage() {
  const { orgId, role, loading: orgLoading } = useOrg();
  const { request } = useGraphQL();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    
    const fetchWorkflows = async () => {
      try {
        const data = await request(`
          query GetWorkflows($orgId: uuid!) {
            workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
              id
              name
              description
              created_at
              workflow_runs(order_by: { started_at: desc }, limit: 1) {
                status
                started_at
              }
            }
          }
        `, { orgId });
        
        setWorkflows(data.workflows || []);
      } catch (err) {
        console.error('Failed to fetch workflows', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchWorkflows();
  }, [orgId, request]);

  if (orgLoading || loading) return <div className="p-8 text-center text-slate-400">Loading workflows...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Workflows</h1>
        {role !== 'viewer' && (
          <Link href="/workflows/new">
            <Button>+ Create Workflow</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map(wf => (
          <Link key={wf.id} href={`/workflows/${wf.id}`}>
            <Card className="hover:border-indigo-500/50 transition-colors cursor-pointer h-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-lg text-white">{wf.name}</h3>
                <Badge 
                  status={wf.workflow_runs?.[0]?.status || 'pending'} 
                  label={wf.workflow_runs?.[0]?.status || 'no runs'} 
                />
              </div>
              <p className="text-slate-400 text-sm mb-4 line-clamp-2">{wf.description || 'No description'}</p>
              <div className="text-xs text-slate-500">
                Created {new Date(wf.created_at).toLocaleDateString()}
              </div>
            </Card>
          </Link>
        ))}
        {workflows.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400 border border-dashed border-slate-700 rounded-xl">
            No workflows found. Create your first one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
