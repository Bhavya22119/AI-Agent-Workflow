import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Node } from '@xyflow/react';
import { useParams } from 'next/navigation';

export default function SettingsPanel({ 
  selectedNode, 
  onUpdate,
  onDelete,
  onClose 
}: { 
  selectedNode: Node | null, 
  onUpdate: (id: string, data: any) => void,
  onDelete?: (id: string) => void,
  onClose: () => void 
}) {
  if (!selectedNode) return null;

  const { id, data } = selectedNode;
  const config = (data.config as any) || {};

  const handleConfigChange = (key: string, value: any) => {
    onUpdate(id, { 
      ...data, 
      config: { ...config, [key]: value } 
    });
  };

  const handleLabelChange = (value: string) => {
    onUpdate(id, { ...data, label: value });
  };

  const params = useParams();
  const workflowId = params.id as string;

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhooks/${workflowId}` 
    : '';

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 bg-white border border-zinc-200 shadow-xl rounded-xl flex flex-col z-20 animate-in fade-in slide-in-from-right-8">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200">
        <div>
          <h3 className="font-semibold text-zinc-900">Node Settings</h3>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{id}</p>
        </div>
        <div className="flex items-center gap-1">
          {onDelete && (
            <button onClick={() => onDelete(id)} className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors" title="Delete Node">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Node Label</label>
          <Input 
            value={data.label as string} 
            onChange={(e) => handleLabelChange(e.target.value)}
            className="h-9"
          />
        </div>

        {/* Dynamic Config Forms based on Type */}
        {data.type === 'webhook_trigger' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-2">
              <p className="text-xs text-blue-700">Send a POST request to this workflow's webhook URL to trigger it.</p>
              <div className="flex items-center gap-2 bg-white border border-blue-200 rounded p-1.5">
                <code className="text-[10px] text-zinc-800 break-all overflow-hidden line-clamp-2 select-all">
                  {webhookUrl}
                </code>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Webhook Secret (Optional)</label>
              <Input 
                type="password"
                value={config.webhook_secret || ''} 
                onChange={(e) => handleConfigChange('webhook_secret', e.target.value)}
                placeholder="secret-token-123"
              />
            </div>
          </div>
        )}

        {data.type === 'db_event_trigger' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Table Name</label>
              <Input 
                value={config.table || ''} 
                onChange={(e) => handleConfigChange('table', e.target.value)}
                placeholder="users"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Event Type</label>
              <Select 
                value={config.event || 'insert'} 
                onChange={(e) => handleConfigChange('event', e.target.value)}
              >
                <option value="insert">Insert</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </Select>
            </div>
          </div>
        )}

        {data.type === 'schedule_trigger' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Cron Expression</label>
            <Input 
              value={config.cron_expression || ''} 
              onChange={(e) => handleConfigChange('cron_expression', e.target.value)}
              placeholder="*/5 * * * *"
            />
            <p className="text-xs text-zinc-500">Standard cron format (e.g. every 5 mins)</p>
          </div>
        )}

        {data.type === 'llm_call' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Prompt</label>
              <Textarea 
                value={config.prompt || ''} 
                onChange={(e) => handleConfigChange('prompt', e.target.value)}
                placeholder="Process this data: {{input}}"
                rows={5}
              />
              <p className="text-xs text-zinc-500">You can use {'{{node_1.output.key}}'} syntax to inject data from previous nodes.</p>
            </div>
          </div>
        )}

        {data.type === 'http_request' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="w-1/3 space-y-2">
                <label className="text-sm font-medium text-zinc-700">Method</label>
                <Select 
                  value={config.method || 'GET'} 
                  onChange={(e) => handleConfigChange('method', e.target.value)}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </Select>
              </div>
              <div className="w-2/3 space-y-2">
                <label className="text-sm font-medium text-zinc-700">URL</label>
                <Input 
                  value={config.url || ''} 
                  onChange={(e) => handleConfigChange('url', e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>
            </div>
          </div>
        )}

        {data.type === 'conditional_branch' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Condition (Expression)</label>
              <Input 
                value={config.condition_path || ''} 
                onChange={(e) => handleConfigChange('condition_path', e.target.value)}
                placeholder="e.g. quote.length > 50"
              />
            </div>
          </div>
        )}

        {data.type === 'notify' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Channel</label>
              <Select 
                value={config.channel || 'email'} 
                onChange={(e) => handleConfigChange('channel', e.target.value)}
              >
                <option value="email">Email</option>
                <option value="slack">Slack</option>
                <option value="sms">SMS</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Recipient</label>
              <Input 
                value={config.recipient || ''} 
                onChange={(e) => handleConfigChange('recipient', e.target.value)}
                placeholder="user@example.com or #channel"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Message</label>
              <Textarea 
                value={config.message || ''} 
                onChange={(e) => handleConfigChange('message', e.target.value)}
                placeholder="Alert: Workflow completed!"
                rows={3}
              />
            </div>
          </div>
        )}
        
        {data.type === 'db_write' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Table Name</label>
              <Input 
                value={config.table || ''} 
                onChange={(e) => handleConfigChange('table', e.target.value)}
                placeholder="users"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Payload (JSON)</label>
              <Textarea 
                value={config.payload || ''} 
                onChange={(e) => handleConfigChange('payload', e.target.value)}
                placeholder='{"name": "{{input.name}}"}'
                className="font-mono text-xs"
                rows={5}
              />
            </div>
          </div>
        )}

      </div>
      
      <div className="p-4 border-t border-zinc-200 bg-zinc-50 rounded-b-xl">
        <Button onClick={onClose} className="w-full">Done</Button>
      </div>
    </div>
  );
}
