"use client";
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const handleRun = () => {
    const runId = Math.random().toString(36).substring(7);
    router.push(`/workflows/${id}/runs/${runId}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Edit Workflow</h1>
        <div className="space-x-4">
          <Button variant="secondary" onClick={() => router.push('/workflows')}>Cancel</Button>
          <Button onClick={handleRun}>Run Now</Button>
        </div>
      </div>

      <Card>
        <p className="text-slate-400 mb-4">This is a placeholder for the workflow edit form, which reuses the NewWorkflowPage components.</p>
        <div className="p-4 bg-slate-800 rounded-lg font-mono text-sm">ID: {id}</div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold mb-4">Recent Runs</h2>
        <div className="space-y-2">
          {[1, 2].map(r => (
            <div key={r} className="flex justify-between items-center p-3 hover:bg-slate-800 rounded-md cursor-pointer transition-colors" onClick={() => router.push(`/workflows/${id}/runs/run-${r}`)}>
              <span>Run #{r}</span>
              <span className="text-indigo-400 text-sm">View details →</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
