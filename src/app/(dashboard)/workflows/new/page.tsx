"use client";

import { useState, useCallback, useRef, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ReactFlow, 
  ReactFlowProvider, 
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Edge,
  Node,
  ReactFlowInstance,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useOrg } from '@/hooks/useOrg';
import { useGraphQL } from '@/hooks/useGraphQL';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import CustomNode from '@/components/workflow-builder/CustomNode';
import Sidebar from '@/components/workflow-builder/Sidebar';
import SettingsPanel from '@/components/workflow-builder/SettingsPanel';

const nodeTypes = {
  custom: CustomNode,
};

let id = 1;
const getId = () => `node_${id++}`;

export default function WorkflowBuilder() {
  const router = useRouter();
  const { role, orgId } = useOrg();
  const { request } = useGraphQL();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const [name, setName] = useState('My Awesome Workflow');
  const [desc, setDesc] = useState('');
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    [rfInstance, setNodes]
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
    if (!name || !orgId) return alert('Workflow Name is required.');
    
    // Separate triggers and action steps based on node type string
    const triggerNodes = nodes.filter(n => (n.data.type as string).includes('trigger'));
    const actionNodes = nodes.filter(n => !(n.data.type as string).includes('trigger'));

    if (triggerNodes.length === 0 && actionNodes.length === 0) {
      return alert('Add at least one node to the workflow.');
    }

    setLoading(true);

    try {
      // 1. Format action nodes for workflow_steps
      const formattedSteps = actionNodes.map((node, idx) => {
        const nodeOutEdges = edges.filter(e => e.source === node.id);
        const nodeInEdges = edges.filter(e => e.target === node.id);

        return {
          position: idx + 1, // Hasura requires an integer position
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

      // 2. Insert workflow + steps
      const response = await request(`
        mutation CreateWorkflow($orgId: uuid!, $name: String!, $desc: String, $steps: [workflow_steps_insert_input!]!) {
          insert_workflows_one(object: {
            org_id: $orgId,
            name: $name,
            description: $desc,
            workflow_steps: {
              data: $steps
            }
          }) {
            id
          }
        }
      `, { orgId, name, desc, steps: formattedSteps });

      const workflowId = response.insert_workflows_one.id;

      // 3. Format triggers
      const triggerObjects = triggerNodes.map(node => {
        const nodeOutEdges = edges.filter(e => e.source === node.id);
        const config = (node.data.config as any) || {};
        
        let type = 'manual';
        if (node.data.type === 'webhook_trigger') type = 'webhook';
        if (node.data.type === 'schedule_trigger') type = 'scheduled';
        if (node.data.type === 'db_event_trigger') type = 'database_event';

        return {
          workflow_id: workflowId,
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

      if (triggerObjects.length > 0) {
        await request(`
          mutation AddTriggers($objects: [workflow_triggers_insert_input!]!) {
            insert_workflow_triggers(objects: $objects) {
              affected_rows
            }
          }
        `, { objects: triggerObjects });
      }

      router.push('/workflows');
    } catch (err: any) {
      console.error(err);
      alert('Failed to save workflow: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-50 overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="w-64 font-semibold border-transparent hover:border-zinc-200 focus:border-indigo-500 bg-transparent text-lg shadow-none px-2"
            placeholder="Workflow Name"
          />
          <Input 
            value={desc} 
            onChange={(e) => setDesc(e.target.value)}
            className="w-96 border-transparent hover:border-zinc-200 focus:border-indigo-500 bg-transparent text-sm text-zinc-500 shadow-none px-2"
            placeholder="Add description..."
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
            {loading ? 'Saving...' : 'Save Workflow'}
          </Button>
        </div>
      </div>

      {/* Builder Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar role={role} />
        
        <div className="flex-1 h-full" ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setRfInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              className="bg-zinc-50"
              defaultEdgeOptions={{ 
                type: 'smoothstep', 
                animated: true,
                style: { strokeWidth: 2, stroke: '#94a3b8' }
              }}
            >
              <Background color="#cbd5e1" gap={24} size={2} />
              <Controls className="bg-white border-zinc-200 shadow-md rounded-lg overflow-hidden" />
              
              <SettingsPanel 
                selectedNode={selectedNode}
                onUpdate={updateNodeData}
                onClose={() => setSelectedNodeId(null)}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
