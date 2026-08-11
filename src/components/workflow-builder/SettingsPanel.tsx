import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Node } from '@xyflow/react';

export default function SettingsPanel({ 
  selectedNode, 
  onUpdate, 
  onClose 
}: { 
  selectedNode: Node | null, 
  onUpdate: (id: string, data: any) => void,
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

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 bg-white border border-zinc-200 shadow-xl rounded-xl flex flex-col z-20 animate-in fade-in slide-in-from-right-8">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200">
        <div>
          <h3 className="font-semibold text-zinc-900">Node Settings</h3>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{id}</p>
        </div>
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors">
          <X className="w-5 h-5" />
        </button>
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
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs text-blue-700">Send a POST request to this workflow's webhook URL to trigger it.</p>
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
              <label className="text-sm font-medium text-zinc-700">Model</label>
              <Select 
                value={config.model || 'llama-3'} 
                onChange={(e) => handleConfigChange('model', e.target.value)}
              >
                <option value="llama-3">Llama 3 (Meta)</option>
                <option value="gpt-4o">GPT-4o (OpenAI)</option>
                <option value="claude-3">Claude 3 (Anthropic)</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">System Prompt</label>
              <Textarea 
                value={config.system_prompt || ''} 
                onChange={(e) => handleConfigChange('system_prompt', e.target.value)}
                placeholder="You are a helpful AI..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">User Prompt</label>
              <Textarea 
                value={config.user_prompt || ''} 
                onChange={(e) => handleConfigChange('user_prompt', e.target.value)}
                placeholder="Process this data: {{input}}"
                rows={4}
              />
              <p className="text-xs text-zinc-500">You can use {'{{variable}}'} syntax to inject data from previous nodes.</p>
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Headers (JSON)</label>
              <Textarea 
                value={config.headers || ''} 
                onChange={(e) => handleConfigChange('headers', e.target.value)}
                placeholder='{"Authorization": "Bearer token"}'
                className="font-mono text-xs"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Body (JSON)</label>
              <Textarea 
                value={config.body || ''} 
                onChange={(e) => handleConfigChange('body', e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-xs"
                rows={4}
              />
            </div>
          </div>
        )}

        {data.type === 'conditional_branch' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Condition Path</label>
              <Input 
                value={config.condition_path || ''} 
                onChange={(e) => handleConfigChange('condition_path', e.target.value)}
                placeholder="e.g. output.status"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Operator</label>
              <Select 
                value={config.operator || 'equals'} 
                onChange={(e) => handleConfigChange('operator', e.target.value)}
              >
                <option value="equals">Equals (==)</option>
                <option value="not_equals">Not Equals (!=)</option>
                <option value="contains">Contains</option>
                <option value="greater_than">Greater Than (&gt;)</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Value</label>
              <Input 
                value={config.value || ''} 
                onChange={(e) => handleConfigChange('value', e.target.value)}
                placeholder="Value to compare against"
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
