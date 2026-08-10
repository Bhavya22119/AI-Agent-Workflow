"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useOrg } from '@/hooks/useOrg';
import { nhost } from '@/lib/nhost';

const STEP_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  llm_call: { label: 'LLM Call', icon: '🤖', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  http_request: { label: 'HTTP Request', icon: '🌐', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  db_write: { label: 'DB Write', icon: '💾', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  notify: { label: 'Notify', icon: '🔔', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  conditional_branch: { label: 'Conditional', icon: '🔀', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  approval_gate: { label: 'Approval Gate', icon: '⏸', color: 'text-rose-600 bg-rose-50 border-rose-200' },
};

const TRIGGER_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  manual: { label: 'Manual', icon: '👆' },
  webhook: { label: 'Webhook', icon: '🔗' },
  scheduled: { label: 'Scheduled', icon: '⏰' },
  database_event: { label: 'Database Event', icon: '📡' },
};

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { request } = useGraphQL();
  const { role, orgId } = useOrg();
  
  const [workflow, setWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    const fetchWf = async () => {
      try {
        const data = await request(`
          query GetWorkflow($id: uuid!) {
            workflows_by_pk(id: $id) {
              id
              org_id
              name
              description
              created_at
              workflow_steps(order_by: { position: asc }) {
                id
                position
                type
                config
              }
              workflow_triggers {
                id
                type
                enabled
                webhook_secret
              }
              workflow_runs(order_by: { started_at: desc }, limit: 10) {
                id
                status
                started_at
                completed_at
              }
            }
          }
        `, { id });
        setWorkflow(data.workflows_by_pk);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchWf();
  }, [id, request]);

  const handleRun = async () => {
    setTriggering(true);

    try {
      const user = nhost.auth.getUser();
      const res = await fetch('/api/trigger-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: id, user_id: user?.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to trigger workflow');
      
      const runId = result.workflow_run_id;
      if (runId) {
        router.push(`/workflows/${id}/runs/${runId}`);
      } else {
        alert('Failed to trigger workflow');
        setTriggering(false);
      }
    } catch (err: any) {
      console.error('Trigger run error:', err);
      const message = err.message || 'Unknown error';
      if (message.includes('quota') || message.includes('Quota')) {
        alert('Organization quota exhausted — cannot start new runs');
      } else if (message.includes('permission') || message.includes('Insufficient')) {
        alert('You do not have permission to trigger this workflow');
      } else {
        alert('Failed to trigger workflow: ' + message);
      }
      setTriggering(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading...</div>;
  if (!workflow) return <div className="p-8 text-center text-rose-600">Workflow not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">{workflow.name}</h1>
          {workflow.description && (
            <p className="text-zinc-500 mt-1">{workflow.description}</p>
          )}
          <p className="text-xs text-zinc-500 mt-2">
            Created {new Date(workflow.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.push('/workflows')}>Back</Button>
          {(role === 'owner' || role === 'editor') && (
            <Button onClick={handleRun} disabled={triggering}>
              {triggering ? 'Triggering...' : '▶ Run Workflow'}
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Steps */}
      <Card>
        <h2 className="text-xl font-bold text-zinc-900 mb-4">
          Steps ({workflow.workflow_steps?.length || 0})
        </h2>
        <div className="space-y-3">
          {workflow.workflow_steps?.map((step: any, idx: number) => {
            const meta = STEP_TYPE_LABELS[step.type] || { label: step.type, icon: '⚙', color: 'text-zinc-500 bg-zinc-100 border-zinc-200' };
            return (
              <div key={step.id} className="relative">
                <div className={`flex items-center gap-4 p-3 rounded-lg border ${meta.color}`}>
                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
                    {step.position}
                  </div>
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-zinc-900">{meta.label}</p>
                    {step.type === 'llm_call' && step.config?.prompt && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">Prompt: {step.config.prompt}</p>
                    )}
                    {step.type === 'http_request' && step.config?.url && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">{step.config.method || 'GET'} {step.config.url}</p>
                    )}
                    {step.type === 'conditional_branch' && step.config?.condition && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        If {step.config.condition.path} {step.config.condition.operator} &quot;{step.config.condition.value}&quot;
                      </p>
                    )}
                    {step.type === 'approval_gate' && step.config?.message && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">{step.config.message}</p>
                    )}
                    {step.type === 'db_write' && step.config?.key && (
                      <p className="text-xs text-zinc-500 mt-0.5">Key: {step.config.key}</p>
                    )}
                  </div>
                </div>
                {/* Connector */}
                {idx < (workflow.workflow_steps?.length || 0) - 1 && (
                  <div className="ml-[19px] h-3 w-px bg-zinc-200" />
                )}
              </div>
            );
          })}
          {(!workflow.workflow_steps || workflow.workflow_steps.length === 0) && (
            <p className="text-zinc-500 italic text-sm">No steps configured</p>
          )}
        </div>
      </Card>

      {/* Triggers */}
      <Card>
        <h2 className="text-xl font-bold text-zinc-900 mb-4">Triggers</h2>
        <div className="flex flex-wrap gap-3">
          {workflow.workflow_triggers?.map((trigger: any) => {
            const meta = TRIGGER_TYPE_LABELS[trigger.type] || { label: trigger.type, icon: '⚡' };
            return (
              <div key={trigger.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                trigger.enabled ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-zinc-100/50'
              }`}>
                <span>{meta.icon}</span>
                <span className="text-sm font-medium text-zinc-900">{meta.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  trigger.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-200 text-zinc-500'
                }`}>
                  {trigger.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
            );
          })}
          {(!workflow.workflow_triggers || workflow.workflow_triggers.length === 0) && (
            <p className="text-zinc-500 italic text-sm">No triggers configured</p>
          )}
        </div>
      </Card>

      {/* Recent Runs */}
      <Card>
        <h2 className="text-xl font-bold mb-4">Recent Runs</h2>
        <div className="space-y-2">
          {workflow.workflow_runs?.map((r: any) => (
            <div key={r.id} className="flex justify-between items-center p-3 hover:bg-zinc-100 rounded-md cursor-pointer transition-colors" onClick={() => router.push(`/workflows/${id}/runs/${r.id}`)}>
              <div>
                <span className="text-sm text-zinc-900">Run {new Date(r.started_at).toLocaleString()}</span>
                {r.completed_at && (
                  <span className="text-xs text-zinc-500 ml-2">
                    ({Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s)
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <Badge status={r.status} label={r.status} />
                <span className="text-indigo-600 text-sm">View →</span>
              </div>
            </div>
          ))}
          {workflow.workflow_runs?.length === 0 && <div className="text-zinc-500 italic">No runs yet</div>}
        </div>
      </Card>
    </div>
  );
}
