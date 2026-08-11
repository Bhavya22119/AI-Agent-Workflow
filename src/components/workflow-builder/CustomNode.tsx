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

const nodeStyles: Record<NodeType, { bg: string, text: string, icon: any, defaultLabel: string }> = {
  // Actions
  llm_call: { bg: 'bg-purple-100', text: 'text-purple-600', icon: Cpu, defaultLabel: 'LLM Call' },
  http_request: { bg: 'bg-blue-100', text: 'text-blue-600', icon: Globe, defaultLabel: 'HTTP Request' },
  db_write: { bg: 'bg-emerald-100', text: 'text-emerald-600', icon: Database, defaultLabel: 'Database Write' },
  notify: { bg: 'bg-rose-100', text: 'text-rose-600', icon: Bell, defaultLabel: 'Notify' },
  conditional_branch: { bg: 'bg-amber-100', text: 'text-amber-600', icon: GitBranch, defaultLabel: 'If/Else' },
  approval_gate: { bg: 'bg-indigo-100', text: 'text-indigo-600', icon: ShieldCheck, defaultLabel: 'Approval Gate' },
  
  // Triggers
  manual_trigger: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: MousePointerClick, defaultLabel: 'Manual Trigger' },
  webhook_trigger: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: Webhook, defaultLabel: 'Webhook' },
  schedule_trigger: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: Clock, defaultLabel: 'Schedule' },
  db_event_trigger: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: Database, defaultLabel: 'DB Event' },
};

export default function CustomNode({ data, isConnectable, selected }: { data: NodeData, isConnectable: boolean, selected: boolean }) {
  const style = nodeStyles[data.type] || nodeStyles.llm_call;
  const Icon = style.icon;
  const isTrigger = data.type.includes('trigger');

  return (
    <div className={cn(
      "flex items-center min-w-[240px] bg-white border rounded-xl shadow-sm transition-all relative group",
      selected ? "border-indigo-500 shadow-md ring-1 ring-indigo-500/20" : "border-zinc-200 hover:border-zinc-300 hover:shadow-md",
      data.status === 'failed' && "border-rose-500",
      data.status === 'running' && "border-blue-500 animate-pulse",
      data.status === 'completed' && "border-emerald-500"
    )}>
      
      {/* Input Handle (Left) - Not for Triggers */}
      {!isTrigger && (
        <Handle 
          type="target" 
          position={Position.Left} 
          isConnectable={isConnectable}
          className="w-3 h-3 bg-zinc-300 border-2 border-white rounded-full -ml-[1.5px]"
        />
      )}

      {/* Node Content */}
      <div className="flex items-center w-full p-3 gap-3">
        {/* Icon Container */}
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", style.bg)}>
          <Icon className={cn("w-5 h-5", style.text)} />
        </div>
        
        {/* Text Container */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <span className="text-sm font-semibold text-zinc-900 truncate">
            {data.label || style.defaultLabel}
          </span>
          {data.description && (
            <span className="text-xs text-zinc-500 truncate">
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
        className="w-3 h-3 bg-indigo-500 border-2 border-white rounded-full -mr-[1.5px]"
      />
      
      {/* Additional Handle for False Branch in Conditionals */}
      {data.type === 'conditional_branch' && (
        <Handle 
          type="source" 
          position={Position.Bottom} 
          id="false"
          isConnectable={isConnectable}
          className="w-3 h-3 bg-rose-500 border-2 border-white rounded-full -mb-[1.5px]"
        />
      )}
    </div>
  );
}
