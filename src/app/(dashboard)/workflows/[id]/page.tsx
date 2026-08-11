"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, DragEvent, useRef } from 'react';
import { 
  ReactFlow, 
  ReactFlowProvider, 
  Background,
  Controls,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphQL } from '@/hooks/useGraphQL';
import { useOrg } from '@/hooks/useOrg';
import { nhost } from '@/lib/nhost';
import { Button } from '@/components/ui/button';
import CustomNode from '@/components/workflow-builder/CustomNode';
import Sidebar from '@/components/workflow-builder/Sidebar';
import SettingsPanel from '@/components/workflow-builder/SettingsPanel';

const nodeTypes = {
  custom: CustomNode,
};

let idCounter = 0;
const getId = () => `node_${Date.now()}_${idCounter++}`;

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { request } = useGraphQL();
  const { role } = useOrg();
  
  const [workflow, setWorkflow] = useState<any>(null);
  
  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<any>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const canEdit = role === 'owner' || role === 'editor';

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
              org_id
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
              position: { x: ui.x || 400, y: ui.y || 150 * idx },
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
        console.error("Failed to load workflow", err);
      } finally {
        setLoading(false);
      }
    };
    fetchWf();
  }, [id, request, setNodes, setEdges]);

  // Editor Handlers
  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!canEdit) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = rfInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) || { x: 0, y: 0 };

      const newNode: Node = {
        id: getId(),
        type: 'custom',
        position,
        data: { 
          type, 
          label,
          config: {} 
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [rfInstance, setNodes, canEdit]
  );

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          node.data = { ...node.data, ...newData };
        }
        return node;
      })
    );
  };

  const handleSave = async () => {
    if (!workflow) return;
    
    // Separate triggers and action steps based on node type string
    const triggerNodes = nodes.filter(n => (n.data.type as string).includes('trigger'));
    const actionNodes = nodes.filter(n => !(n.data.type as string).includes('trigger'));

    if (triggerNodes.length === 0 && actionNodes.length === 0) {
      return alert('Add at least one node to the workflow.');
    }

    setSaving(true);

    try {
      // 1. Format action nodes
      const formattedSteps = actionNodes.map((node, idx) => {
        const nodeOutEdges = edges.filter(e => e.source === node.id);
        const nodeInEdges = edges.filter(e => e.target === node.id);

        return {
          workflow_id: workflow.id,
          position: idx + 1,
          type: node.data.type,
          config: {
            ...((node.data.config as any) || {}),
            ui: {
              id: node.id,
              x: node.position.x,
              y: node.position.y,
              out_edges: nodeOutEdges,
              in_edges: nodeInEdges,
              label: node.data.label
            }
          }
        };
      });

      // 2. Format triggers
      const triggerObjects = triggerNodes.map(node => {
        const nodeOutEdges = edges.filter(e => e.source === node.id);
        const config = (node.data.config as any) || {};
        
        let type = 'manual';
        if (node.data.type === 'webhook_trigger') type = 'webhook';
        if (node.data.type === 'schedule_trigger') type = 'scheduled';
        if (node.data.type === 'db_event_trigger') type = 'database_event';

        return {
          workflow_id: workflow.id,
          type: type,
          webhook_secret: config.webhook_secret || null,
          config: {
            ...config,
            ui: {
              id: node.id,
              x: node.position.x,
              y: node.position.y,
              out_edges: nodeOutEdges,
              label: node.data.label
            }
          }
        };
      });

      // 3. Update Workflow (Delete old steps/triggers, insert new ones)
      await request(`
        mutation UpdateWorkflow(
          $workflowId: uuid!, 
          $steps: [workflow_steps_insert_input!]!, 
          $triggers: [workflow_triggers_insert_input!]!
        ) {
          delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) { affected_rows }
          delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) { affected_rows }
          
          insert_workflow_steps(objects: $steps) { affected_rows }
          insert_workflow_triggers(objects: $triggers) { affected_rows }
        }
      `, { workflowId: workflow.id, steps: formattedSteps, triggers: triggerObjects });

      alert('Workflow saved successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Failed to save workflow: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setTriggering(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch(`https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.functions.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/trigger-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ workflow_id: id })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger workflow');
      
      router.push(`/workflows/${id}/runs/${data.run_id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-zinc-500">Loading Workflow...</div>;
  }

  if (!workflow) {
    return <div className="p-8 flex items-center justify-center text-rose-500">Workflow not found.</div>;
  }

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-50 overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div>
          <h2 className="font-semibold text-lg text-zinc-900">{workflow.name}</h2>
          {workflow.description && (
            <p className="text-sm text-zinc-500 truncate w-96">{workflow.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => router.back()}>Back</Button>
          {canEdit && (
            <Button 
              onClick={handleSave} 
              disabled={saving} 
              variant="secondary"
              className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
          <Button 
            onClick={handleRun} 
            disabled={triggering}
            className="bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {triggering ? 'Starting...' : '▶ Run Workflow'}
          </Button>
        </div>
      </div>

      {/* Builder Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {canEdit && <Sidebar role={role} />}
        
        <div className="flex-1 h-full" ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={canEdit ? onNodesChange : undefined}
              onEdgesChange={canEdit ? onEdgesChange : undefined}
              onConnect={canEdit ? onConnect : undefined}
              onInit={setRfInstance}
              onDrop={canEdit ? onDrop : undefined}
              onDragOver={canEdit ? onDragOver : undefined}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
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
              
              {canEdit && (
                <SettingsPanel 
                  selectedNode={selectedNode}
                  onUpdate={updateNodeData}
                  onDelete={(nodeId) => {
                    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
                    setSelectedNodeId(null);
                  }}
                  onClose={() => setSelectedNodeId(null)}
                />
              )}
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
