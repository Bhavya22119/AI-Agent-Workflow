"use client";
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function WorkflowRunPage() {
  const params = useParams();
  const router = useRouter();

  const steps = [
    { id: '1', position: 1, type: 'http_request', status: 'completed', output: { status: 200 } },
    { id: '2', position: 2, type: 'llm_call', status: 'running' },
    { id: '3', position: 3, type: 'approval_gate', status: 'pending' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => router.back()} className="text-slate-400 hover:text-white text-sm flex items-center">
        ← Back to Workflow
      </button>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Run Viewer</h1>
          <p className="text-slate-400 text-sm font-mono">{params.runId}</p>
        </div>
        <Badge status="running" label="Running" className="text-lg px-4 py-1" />
      </div>

      <div className="space-y-4 mt-8">
        {steps.map(step => (
          <Card key={step.id} className={`transition-all duration-300 ${step.status === 'running' ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : step.status === 'running' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                  {step.position}
                </div>
                <div>
                  <h3 className="font-semibold text-white capitalize">{step.type.replace('_', ' ')}</h3>
                </div>
              </div>
              <Badge status={step.status as any} label={step.status} />
            </div>

            {step.status === 'completed' && step.output && (
              <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 overflow-x-auto">
                <pre className="text-xs text-emerald-400 font-mono">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
              </div>
            )}

            {step.status === 'pending' && step.type === 'approval_gate' && (
              <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-amber-400 text-sm mb-3">Workflow is waiting for approval before continuing.</p>
                <Button className="bg-amber-500 hover:bg-amber-600 text-white border-none">Approve Proceed</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
