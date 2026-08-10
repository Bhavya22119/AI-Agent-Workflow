"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useOrg } from '@/hooks/useOrg';
import { useGraphQL } from '@/hooks/useGraphQL';

export default function NewWorkflowPage() {
  const router = useRouter();
  const { role, orgId } = useOrg();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [steps, setSteps] = useState<any[]>([]);

  const [triggers, setTriggers] = useState({
    manual: false,
    webhook: false,
    scheduled: false,
    database_event: false
  });
  const [triggerConfigs, setTriggerConfigs] = useState({
    webhook_secret: '',
    cron_expression: ''
  });

  const { request } = useGraphQL();
  const [loading, setLoading] = useState(false);

  const addStep = (type: string) => {
    setSteps([...steps, { id: Date.now(), type, config: {} }]);
  };

  const updateStepConfig = (id: number, configUpdate: any) => {
    setSteps(steps.map(s => s.id === id ? { ...s, config: { ...s.config, ...configUpdate } } : s));
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setSteps(newSteps);
  };

  const moveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    [newSteps[index + 1], newSteps[index]] = [newSteps[index], newSteps[index + 1]];
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!name || !orgId) return alert('Name and Organization required.');
    setLoading(true);
    
    try {
      const formattedSteps = steps.map((s, idx) => ({
        position: idx + 1,
        type: s.type,
        config: s.config
      }));

      // We use insert_workflows_one to insert workflow and nested workflow_steps together
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

      const triggerObjects = [];
      if (triggers.manual) {
        triggerObjects.push({ workflow_id: workflowId, type: 'manual', config: {} });
      }
      if (triggers.webhook && role === 'owner') {
        triggerObjects.push({ workflow_id: workflowId, type: 'webhook', webhook_secret: triggerConfigs.webhook_secret, config: {} });
      }
      if (triggers.scheduled) {
        triggerObjects.push({ workflow_id: workflowId, type: 'scheduled', config: { cron_expression: triggerConfigs.cron_expression } });
      }
      if (triggers.database_event) {
        triggerObjects.push({ workflow_id: workflowId, type: 'database_event', config: {} });
      }

      if (triggerObjects.length > 0) {
        await request(`
          mutation AddTriggers($objects: [workflow_triggers_insert_input!]!) {
            insert_workflow_triggers(objects: $objects) { affected_rows }
          }
        `, { objects: triggerObjects });
      }

      router.push('/workflows');
    } catch (err) {
      console.error(err);
      alert('Failed to save workflow.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Create Workflow</h1>
        <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Workflow'}</Button>
      </div>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">General</h2>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Report Generator" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <Textarea value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Triggers</h2>
        <div className="space-y-3">
          <label className="flex items-center space-x-2 text-slate-300">
            <input 
              type="checkbox" 
              checked={triggers.manual} 
              onChange={e => setTriggers({ ...triggers, manual: e.target.checked })} 
            />
            <span>Manual</span>
          </label>
          
          {role === 'owner' && (
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-slate-300">
                <input 
                  type="checkbox" 
                  checked={triggers.webhook} 
                  onChange={e => setTriggers({ ...triggers, webhook: e.target.checked })} 
                />
                <span>Webhook</span>
              </label>
              {triggers.webhook && (
                <div className="pl-6">
                  <Input 
                    placeholder="Webhook Secret" 
                    value={triggerConfigs.webhook_secret}
                    onChange={e => setTriggerConfigs({ ...triggerConfigs, webhook_secret: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center space-x-2 text-slate-300">
              <input 
                type="checkbox" 
                checked={triggers.scheduled} 
                onChange={e => setTriggers({ ...triggers, scheduled: e.target.checked })} 
              />
              <span>Scheduled</span>
            </label>
            {triggers.scheduled && (
              <div className="pl-6">
                <Input 
                  placeholder="Cron Expression (e.g. 0 0 * * *)" 
                  value={triggerConfigs.cron_expression}
                  onChange={e => setTriggerConfigs({ ...triggerConfigs, cron_expression: e.target.value })}
                />
              </div>
            )}
          </div>

          <label className="flex items-center space-x-2 text-slate-300">
            <input 
              type="checkbox" 
              checked={triggers.database_event} 
              onChange={e => setTriggers({ ...triggers, database_event: e.target.checked })} 
            />
            <span>Database Event</span>
          </label>
        </div>
      </Card>

      <Card className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Steps</h2>
          <Select className="w-48" onChange={(e) => { if(e.target.value) { addStep(e.target.value); e.target.value=''; } }}>
            <option value="">+ Add Step</option>
            <option value="llm_call">LLM Call</option>
            <option value="http_request">HTTP Request</option>
            {role === 'owner' && <option value="db_write">DB Write (Owner)</option>}
            {role === 'owner' && <option value="notify">Notify (Owner)</option>}
            <option value="conditional_branch">Conditional</option>
            <option value="approval_gate">Approval Gate</option>
          </Select>
        </div>

        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={step.id} className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg relative group">
              <div className="absolute top-4 right-4 flex space-x-2">
                <button 
                  onClick={() => moveStepUp(idx)}
                  disabled={idx === 0}
                  className="text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                >
                  ↑
                </button>
                <button 
                  onClick={() => moveStepDown(idx)}
                  disabled={idx === steps.length - 1}
                  className="text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                >
                  ↓
                </button>
                <button 
                  onClick={() => setSteps(steps.filter(s => s.id !== step.id))}
                  className="text-slate-500 hover:text-rose-500 transition-colors ml-2"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex items-center space-x-3 mb-4">
                <span className="w-6 h-6 flex items-center justify-center bg-indigo-500/20 text-indigo-400 rounded-full text-xs font-bold">
                  {idx + 1}
                </span>
                <span className="text-sm font-medium text-white px-2 py-1 bg-slate-700 rounded">
                  {step.type}
                </span>
              </div>
              
              <div className="space-y-3">
                {step.type === 'llm_call' && (
                  <>
                    <Textarea 
                      placeholder="Prompt template..." 
                      value={step.config.prompt || ''} 
                      onChange={e => updateStepConfig(step.id, { prompt: e.target.value })} 
                    />
                    <Input 
                      placeholder="Model (e.g. llama3-8b-8192)" 
                      value={step.config.model || ''} 
                      onChange={e => updateStepConfig(step.id, { model: e.target.value })} 
                    />
                  </>
                )}
                {step.type === 'http_request' && (
                  <>
                    <Input 
                      placeholder="URL" 
                      value={step.config.url || ''} 
                      onChange={e => updateStepConfig(step.id, { url: e.target.value })} 
                    />
                    <Select value={step.config.method || 'GET'} onChange={e => updateStepConfig(step.id, { method: e.target.value })}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </Select>
                  </>
                )}
                {step.type === 'approval_gate' && (
                  <Textarea 
                    placeholder="Message for approver..." 
                    value={step.config.message || ''} 
                    onChange={e => updateStepConfig(step.id, { message: e.target.value })} 
                  />
                )}
                {step.type === 'db_write' && (
                  <>
                    <Input 
                      placeholder="Output Key" 
                      value={step.config.key || ''} 
                      onChange={e => updateStepConfig(step.id, { key: e.target.value })} 
                    />
                    <Input 
                      placeholder="Value Template (e.g. {{prev_output}})" 
                      value={step.config.value_template || ''} 
                      onChange={e => updateStepConfig(step.id, { value_template: e.target.value })} 
                    />
                  </>
                )}
                {step.type === 'notify' && (
                  <>
                    <Input 
                      placeholder="Channel (e.g. #general, email@example.com)" 
                      value={step.config.channel || ''} 
                      onChange={e => updateStepConfig(step.id, { channel: e.target.value })} 
                    />
                    <Textarea 
                      placeholder="Message content..." 
                      value={step.config.message || ''} 
                      onChange={e => updateStepConfig(step.id, { message: e.target.value })} 
                    />
                  </>
                )}
                {step.type === 'conditional_branch' && (
                  <>
                    <Input 
                      placeholder="Condition Path (e.g. output.status)" 
                      value={step.config.condition_path || ''} 
                      onChange={e => updateStepConfig(step.id, { condition_path: e.target.value })} 
                    />
                    <Select 
                      value={step.config.operator || ''}
                      onChange={e => updateStepConfig(step.id, { operator: e.target.value })}
                    >
                      <option value="">Select Operator</option>
                      <option value="===">Equals (===)</option>
                      <option value="!==">Not Equals (!==)</option>
                      <option value=">">Greater Than (&gt;)</option>
                      <option value="<">Less Than (&lt;)</option>
                      <option value="contains">Contains</option>
                    </Select>
                    <Input 
                      placeholder="Value to compare against" 
                      value={step.config.value || ''} 
                      onChange={e => updateStepConfig(step.id, { value: e.target.value })} 
                    />
                    <div className="flex space-x-2">
                      <Input 
                        type="number"
                        placeholder="True Next (Position)" 
                        value={step.config.true_next || ''} 
                        onChange={e => updateStepConfig(step.id, { true_next: parseInt(e.target.value) || e.target.value })} 
                      />
                      <Input 
                        type="number"
                        placeholder="False Next (Position)" 
                        value={step.config.false_next || ''} 
                        onChange={e => updateStepConfig(step.id, { false_next: parseInt(e.target.value) || e.target.value })} 
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {steps.length === 0 && (
            <div className="text-center py-8 text-slate-500 italic">No steps added yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
