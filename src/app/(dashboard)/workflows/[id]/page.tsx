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
import { Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
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
      // 1. Topologically sort actionNodes
      const sortedActionNodes: typeof actionNodes = [];
      const visited = new Set<string>();
      const visiting = new Set<string>();

      const visit = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        if (visiting.has(nodeId)) return; // Cycle detected, ignore
        visiting.add(nodeId);

        const incomingEdges = edges.filter(e => e.target === nodeId);
        for (const edge of incomingEdges) {
          if (actionNodes.find(n => n.id === edge.source)) {
            visit(edge.source);
          }
        }

        visiting.delete(nodeId);
        visited.add(nodeId);
        
        const node = actionNodes.find(n => n.id === nodeId);
        if (node) sortedActionNodes.push(node);
      };

      for (const node of actionNodes) {
        visit(node.id);
      }

      // 2. Format action nodes with sequential positions
      const formattedSteps = sortedActionNodes.map((node, idx) => {
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

      // 3. Update Workflow using API route (bypasses Hasura metadata sync issues)
      const token = nhost.auth.getAccessToken();
      const saveRes = await fetch('/api/save-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          workflowId: workflow.id,
          orgId: workflow.org_id,
          steps: formattedSteps,
          triggers: triggerObjects
        })
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Failed to save workflow');
      }

      alert('Workflow saved successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Failed to save workflow: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async () => {
    if (!workflow) return;
    setTriggering(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch('/api/run-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ workflowId: workflow.id })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Trigger failed');
      
      router.push(`/workflows/${workflow.id}/runs/${json.workflow_run_id}`);
    } catch (err: any) {
      alert('Error starting run: ' + err.message);
      setTriggering(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!editName.trim()) return alert('Name is required');
    setSavingSettings(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch('/api/update-workflow-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          workflowId: workflow.id,
          orgId: workflow.org_id,
          name: editName,
          description: editDesc
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      
      setWorkflow({ ...workflow, name: json.data.name, description: json.data.description });
      setIsSettingsOpen(false);
    } catch (err: any) {
      alert('Error saving settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!workflow || !confirm('Are you sure you want to delete this workflow? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch('/api/delete-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ workflowId: workflow.id, orgId: workflow.org_id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete workflow');
      
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message);
      setDeleting(false);
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
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-950 overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div 
          className={`group flex flex-col ${canEdit ? 'cursor-pointer hover:bg-zinc-900 p-1 -ml-1 rounded' : ''}`}
          onClick={() => {
            if (!canEdit) return;
            setEditName(workflow.name);
            setEditDesc(workflow.description || '');
            setIsSettingsOpen(true);
          }}
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg text-white">{workflow.name}</h2>
            {canEdit && <Pencil className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </div>
          {workflow.description && (
            <p className="text-sm text-zinc-400 truncate w-96">{workflow.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => router.back()} className="bg-zinc-800 text-white hover:bg-zinc-700 border-0">Back</Button>
          {canEdit && (
            <>
              <Button 
                onClick={handleDelete} 
                disabled={deleting} 
                variant="secondary"
                className="border-rose-900/50 text-rose-400 bg-rose-950 hover:bg-rose-900 border"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white border-0"
              >
                {saving ? 'Saving...' : 'Save Workflow'}
              </Button>
            </>
          )}
          <Button 
            onClick={handleTrigger} 
            disabled={triggering}
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
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
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-lg text-white">Edit Workflow Details</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Name</label>
                <Input 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)} 
                  placeholder="e.g. Lead Qualification"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Description (Optional)</label>
                <Textarea 
                  value={editDesc} 
                  onChange={(e) => setEditDesc(e.target.value)} 
                  placeholder="What does this workflow do?"
                  rows={3}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setIsSettingsOpen(false)} className="bg-zinc-800 text-white hover:bg-zinc-700 border-0">Cancel</Button>
              <Button 
                onClick={handleSaveSettings} 
                disabled={savingSettings || !editName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white border-0"
              >
                {savingSettings ? 'Saving...' : 'Save Details'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
