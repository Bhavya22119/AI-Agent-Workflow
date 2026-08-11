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
  { type: 'manual_trigger', label: 'Manual Trigger', description: 'Start workflow manually', icon: MousePointerClick, category: 'trigger', color: 'text-zinc-400 bg-zinc-500/10 border border-zinc-700/50' },
  { type: 'webhook_trigger', label: 'Webhook', description: 'Trigger via HTTP POST', icon: Webhook, category: 'trigger', color: 'text-zinc-400 bg-zinc-500/10 border border-zinc-700/50' },
  { type: 'schedule_trigger', label: 'Schedule', description: 'Run on a cron schedule', icon: Clock, category: 'trigger', color: 'text-zinc-400 bg-zinc-500/10 border border-zinc-700/50' },
  { type: 'db_event_trigger', label: 'DB Event', description: 'Trigger on database insert/update', icon: Database, category: 'trigger', color: 'text-zinc-400 bg-zinc-500/10 border border-zinc-700/50' },
  
  // Actions
  { type: 'llm_call', label: 'LLM Call', description: 'Call Llama 3 or other AI models', icon: Cpu, category: 'action', color: 'text-purple-400 bg-purple-500/10 border border-purple-500/20' },
  { type: 'http_request', label: 'HTTP Request', description: 'Make an API call', icon: Globe, category: 'action', color: 'text-blue-400 bg-blue-500/10 border border-blue-500/20' },
  { type: 'db_write', label: 'Database Write', description: 'Insert or update data in Hasura', icon: Database, category: 'action', color: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' },
  { type: 'notify', label: 'Notify', description: 'Send a Slack/Email message', icon: Bell, category: 'action', color: 'text-rose-400 bg-rose-500/10 border border-rose-500/20' },
  { type: 'conditional_branch', label: 'If/Else', description: 'Branch based on a condition', icon: GitBranch, category: 'action', color: 'text-amber-400 bg-amber-500/10 border border-amber-500/20' },
  { type: 'approval_gate', label: 'Approval Gate', description: 'Pause for human approval', icon: ShieldCheck, category: 'action', color: 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20' },
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
    <aside className="w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full shadow-sm z-10 relative shrink-0">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="font-semibold text-white">Add Nodes</h2>
        <p className="text-xs text-zinc-400 mt-1">Drag and drop nodes onto the canvas to build your workflow.</p>
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
                    "flex items-center gap-3 p-3 rounded-lg border bg-zinc-900 transition-colors shadow-sm",
                    isRestricted 
                      ? "opacity-50 cursor-not-allowed border-zinc-800" 
                      : "cursor-grab active:cursor-grabbing border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80"
                  )}
                  draggable={!isRestricted}
                  onDragStart={(e) => onDragStart(e, node.type, node.label)}
                  title={isRestricted ? "Owner access required" : ""}
                >
                  <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 shadow-inner", node.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{node.label}</p>
                    <p className="text-[10px] text-zinc-400">{node.description}</p>
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
                    "flex items-center gap-3 p-3 rounded-lg border bg-zinc-900 transition-colors shadow-sm",
                    isRestricted 
                      ? "opacity-50 cursor-not-allowed border-zinc-800" 
                      : "cursor-grab active:cursor-grabbing border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80"
                  )}
                  draggable={!isRestricted}
                  onDragStart={(e) => onDragStart(e, node.type, node.label)}
                  title={isRestricted ? "Owner access required" : ""}
                >
                  <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 shadow-inner", node.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{node.label}</p>
                    <p className="text-[10px] text-zinc-400">{node.description}</p>
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
