import { DragEvent } from 'react';
import { 
  Cpu, 
  Globe, 
  Database, 
  Bell, 
  GitBranch, 
  ShieldCheck,
  MousePointerClick,
  Webhook,
  Clock
} from 'lucide-react';
import { NodeType } from './CustomNode';
import { cn } from '@/lib/utils';

interface SidebarNode {
  type: NodeType;
  label: string;
  description: string;
  icon: any;
  category: 'trigger' | 'action';
  color: string;
}

const SIDEBAR_NODES: SidebarNode[] = [
  // Triggers
  { type: 'manual_trigger', label: 'Manual Trigger', description: 'Start workflow manually', icon: MousePointerClick, category: 'trigger', color: 'text-zinc-600 bg-zinc-100' },
  { type: 'webhook_trigger', label: 'Webhook', description: 'Trigger via HTTP POST', icon: Webhook, category: 'trigger', color: 'text-zinc-600 bg-zinc-100' },
  { type: 'schedule_trigger', label: 'Schedule', description: 'Run on a cron schedule', icon: Clock, category: 'trigger', color: 'text-zinc-600 bg-zinc-100' },
  { type: 'db_event_trigger', label: 'DB Event', description: 'Trigger on database insert/update', icon: Database, category: 'trigger', color: 'text-zinc-600 bg-zinc-100' },
  
  // Actions
  { type: 'llm_call', label: 'LLM Call', description: 'Call Llama 3 or other AI models', icon: Cpu, category: 'action', color: 'text-purple-600 bg-purple-100' },
  { type: 'http_request', label: 'HTTP Request', description: 'Make an API call', icon: Globe, category: 'action', color: 'text-blue-600 bg-blue-100' },
  { type: 'db_write', label: 'Database Write', description: 'Insert or update data in Hasura', icon: Database, category: 'action', color: 'text-emerald-600 bg-emerald-100' },
  { type: 'notify', label: 'Notify', description: 'Send a Slack/Email message', icon: Bell, category: 'action', color: 'text-rose-600 bg-rose-100' },
  { type: 'conditional_branch', label: 'If/Else', description: 'Branch based on a condition', icon: GitBranch, category: 'action', color: 'text-amber-600 bg-amber-100' },
  { type: 'approval_gate', label: 'Approval Gate', description: 'Pause for human approval', icon: ShieldCheck, category: 'action', color: 'text-indigo-600 bg-indigo-100' },
];

export default function Sidebar({ role }: { role?: string | null }) {
  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const triggers = SIDEBAR_NODES.filter(n => n.category === 'trigger');
  const actions = SIDEBAR_NODES.filter(n => n.category === 'action');

  return (
    <aside className="w-72 bg-white border-l border-zinc-200 flex flex-col h-full shadow-sm z-10 relative">
      <div className="p-4 border-b border-zinc-200">
        <h2 className="font-semibold text-zinc-900">Add Nodes</h2>
        <p className="text-xs text-zinc-500 mt-1">Drag and drop nodes onto the canvas to build your workflow.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Triggers</h3>
          <div className="space-y-2">
            {triggers.map(node => {
              const Icon = node.icon;
              // Only owners can add webhook/schedule/dbevent triggers
              const isRestricted = (node.type === 'webhook_trigger' || node.type === 'schedule_trigger' || node.type === 'db_event_trigger') && role !== 'owner';
              
              return (
                <div
                  key={node.type}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50 transition-colors",
                    isRestricted ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:bg-indigo-50/50"
                  )}
                  draggable={!isRestricted}
                  onDragStart={(e) => onDragStart(e, node.type, node.label)}
                  title={isRestricted ? "Owner access required" : ""}
                >
                  <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0", node.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{node.label}</p>
                    <p className="text-[10px] text-zinc-500">{node.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Actions</h3>
          <div className="space-y-2">
            {actions.map(node => {
              const Icon = node.icon;
              const isRestricted = (node.type === 'db_write' || node.type === 'notify') && role !== 'owner';

              return (
                <div
                  key={node.type}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50 transition-colors",
                    isRestricted ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:bg-indigo-50/50"
                  )}
                  draggable={!isRestricted}
                  onDragStart={(e) => onDragStart(e, node.type, node.label)}
                  title={isRestricted ? "Owner access required" : ""}
                >
                  <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0", node.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{node.label}</p>
                    <p className="text-[10px] text-zinc-500">{node.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
