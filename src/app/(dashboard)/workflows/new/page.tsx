"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useOrg } from '@/hooks/useOrg';

export default function NewWorkflowPage() {
  const router = useRouter();
  const { role } = useOrg();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [steps, setSteps] = useState<any[]>([]);

  const addStep = (type: string) => {
    setSteps([...steps, { id: Date.now(), type, config: {} }]);
  };

  const handleSave = () => {
    // Implement save logic via GraphQL
    router.push('/workflows');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Create Workflow</h1>
        <Button onClick={handleSave}>Save Workflow</Button>
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
              <button 
                onClick={() => setSteps(steps.filter(s => s.id !== step.id))}
                className="absolute top-4 right-4 text-slate-500 hover:text-rose-500 transition-colors"
              >
                ✕
              </button>
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
                  <Textarea placeholder="Prompt template..." />
                )}
                {step.type === 'http_request' && (
                  <>
                    <Input placeholder="URL" />
                    <Select><option>GET</option><option>POST</option></Select>
                  </>
                )}
                {step.type === 'approval_gate' && (
                  <Textarea placeholder="Message for approver..." />
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
