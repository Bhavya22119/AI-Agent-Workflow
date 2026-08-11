import { Handle, Position } from '@xyflow/react';
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
import { cn } from '@/lib/utils';

export type NodeType = 
  | 'llm_call' 
  | 'http_request' 
  | 'db_write' 
  | 'notify' 
  | 'conditional_branch' 
  | 'approval_gate'
  | 'manual_trigger'
  | 'webhook_trigger'
  | 'schedule_trigger'
  | 'db_event_trigger';

interface NodeData {
  type: NodeType;
  label: string;
  description?: string;
  icon?: any;
  status?: 'running' | 'completed' | 'failed' | 'paused' | 'pending';
}

const nodeStyles: Record<NodeType, { strip: string, bg: string, text: string, icon: any, defaultLabel: string }> = {
  // Actions
  llm_call: { strip: 'bg-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', icon: Cpu, defaultLabel: 'LLM Call' },
  http_request: { strip: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', icon: Globe, defaultLabel: 'HTTP Request' },
  db_write: { strip: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: Database, defaultLabel: 'Database Write' },
  notify: { strip: 'bg-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-400', icon: Bell, defaultLabel: 'Notify' },
  conditional_branch: { strip: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: GitBranch, defaultLabel: 'If/Else' },
  approval_gate: { strip: 'bg-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400', icon: ShieldCheck, defaultLabel: 'Approval Gate' },
  
  // Triggers
  manual_trigger: { strip: 'bg-zinc-400', bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: MousePointerClick, defaultLabel: 'Manual Trigger' },
  webhook_trigger: { strip: 'bg-zinc-400', bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: Webhook, defaultLabel: 'Webhook' },
  schedule_trigger: { strip: 'bg-zinc-400', bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: Clock, defaultLabel: 'Schedule' },
  db_event_trigger: { strip: 'bg-zinc-400', bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: Database, defaultLabel: 'DB Event' },
};

export default function CustomNode({ data, isConnectable, selected }: { data: NodeData, isConnectable: boolean, selected: boolean }) {
  const style = nodeStyles[data.type] || nodeStyles.llm_call;
  const Icon = style.icon;
  const isTrigger = data.type.includes('trigger');

  return (
    <div className={cn(
      "flex items-center min-w-[240px] bg-[#1E2330] border rounded-lg shadow-md transition-all relative group",
      selected ? "border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg" : "border-zinc-700/60 hover:border-zinc-500 hover:shadow-lg",
      data.status === 'failed' && "border-rose-500",
      data.status === 'running' && "border-blue-500 animate-pulse",
      data.status === 'completed' && "border-emerald-500"
    )}>
      {/* n8n style left color strip */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg", style.strip)} />
      
      {/* Input Handle (Left) - Not for Triggers */}
      {!isTrigger && (
        <Handle 
          type="target" 
          position={Position.Left} 
          isConnectable={isConnectable}
          className="w-3 h-3 bg-zinc-400 border-2 border-[#1E2330] rounded-full -ml-[1.5px] z-10"
        />
      )}

      {/* Node Content */}
      <div className="flex items-center w-full p-2.5 pl-4 gap-3">
        {/* Icon Container */}
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-zinc-700/50 shadow-inner", style.bg)}>
          <Icon className={cn("w-5 h-5", style.text)} />
        </div>
        
        {/* Text Container */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <span className="text-sm font-semibold text-zinc-100 truncate">
            {data.label || style.defaultLabel}
          </span>
          {data.description && (
            <span className="text-xs text-zinc-400 truncate">
              {data.description}
            </span>
          )}
        </div>
      </div>

      {/* Output Handle (Right) */}
      <Handle 
        type="source" 
        position={Position.Right} 
        isConnectable={isConnectable}
        className="w-3 h-3 bg-indigo-400 border-2 border-[#1E2330] rounded-full -mr-[1.5px]"
      />
      
      {/* Additional Handle for False Branch in Conditionals */}
      {data.type === 'conditional_branch' && (
        <Handle 
          type="source" 
          position={Position.Bottom} 
          id="false"
          isConnectable={isConnectable}
          className="w-3 h-3 bg-rose-400 border-2 border-[#1E2330] rounded-full -mb-[1.5px]"
        />
      )}
    </div>
  );
}
