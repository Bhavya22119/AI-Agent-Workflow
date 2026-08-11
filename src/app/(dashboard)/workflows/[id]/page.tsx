"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { 
  ReactFlow, 
  ReactFlowProvider, 
  Background,
  Controls,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphQL } from '@/hooks/useGraphQL';
import { useOrg } from '@/hooks/useOrg';
import { nhost } from '@/lib/nhost';
import { Button } from '@/components/ui/button';
import CustomNode from '@/components/workflow-builder/CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { request } = useGraphQL();
  const { role } = useOrg();
  
  const [workflow, setWorkflow] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    const fetchWf = async () => {
      try {
        const data = await request(`
          query GetWorkflow($id: uuid!) {
            workflows_by_pk(id: $id) {
              id
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
                config
              }
            }
          }
        `, { id });
        
        const wf = data.workflows_by_pk;
        if (wf) {
          setWorkflow(wf);
          
          const rfNodes: Node[] = [];
          const rfEdges: Edge[] = [];

          // Parse Triggers
          wf.workflow_triggers?.forEach((trigger: any, idx: number) => {
            const config = trigger.config || {};
            const ui = config.ui || {};
            const typeStr = trigger.type === 'database_event' ? 'db_event_trigger' : 
                            trigger.type === 'scheduled' ? 'schedule_trigger' : 
                            `${trigger.type}_trigger`;
            
            rfNodes.push({
              id: ui.id || `trigger-${trigger.id}`,
              type: 'custom',
              position: { x: ui.x || 100, y: ui.y || 150 * idx },
              data: {
                type: typeStr,
                label: ui.label || trigger.type,
                config: config
              }
            });
            
            if (ui.out_edges) rfEdges.push(...ui.out_edges);
          });

          // Parse Action Steps
          wf.workflow_steps?.forEach((step: any, idx: number) => {
            const config = step.config || {};
            const ui = config.ui || {};
            
            rfNodes.push({
              id: ui.id || `step-${step.id}`,
              type: 'custom',
              position: { x: ui.x || 400 + (250 * idx), y: ui.y || 200 },
              data: {
                type: step.type,
                label: ui.label || step.type,
                config: config
              }
            });
            
            if (ui.out_edges) rfEdges.push(...ui.out_edges);
          });

          setNodes(rfNodes);
          setEdges(rfEdges);
        }
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
      if (!res.ok) throw new Error(result.message || 'Failed to trigger');
      
      const runId = result.workflow_run_id;
      if (runId) router.push(`/workflows/${id}/runs/${runId}`);
      else alert('Failed to trigger workflow');
    } catch (err: any) {
      console.error(err);
      alert('Failed to trigger workflow: ' + err.message);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading...</div>;
  if (!workflow) return <div className="p-8 text-center text-rose-600">Workflow not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-50 overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 truncate max-w-sm">{workflow.name}</h1>
          <p className="text-xs text-zinc-500 truncate max-w-sm">{workflow.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => router.push('/workflows')}>Back</Button>
          {(role === 'owner' || role === 'editor') && (
            <Button onClick={handleRun} disabled={triggering} className="bg-indigo-600 hover:bg-indigo-700">
              {triggering ? 'Triggering...' : '▶ Run Workflow'}
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 w-full relative">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            colorMode="dark"
            className="bg-zinc-950"
            defaultEdgeOptions={{ 
              type: 'smoothstep', 
              animated: true,
              style: { strokeWidth: 2, stroke: '#818cf8' }
            }}
            connectionLineStyle={{ stroke: '#818cf8', strokeWidth: 2 }}
          >
            <Background color="#3f3f46" gap={24} size={2} />
            <Controls className="bg-zinc-900 border-zinc-800 fill-white shadow-md rounded-lg overflow-hidden" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
