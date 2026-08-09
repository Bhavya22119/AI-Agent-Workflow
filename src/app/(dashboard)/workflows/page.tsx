"use client";
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrg } from '@/hooks/useOrg';

export default function WorkflowsPage() {
  const { role } = useOrg();
  
  // Dummy data for now
  const workflows = [
    { id: '1', name: 'Customer Onboarding', desc: 'Send emails and setup CRM', status: 'completed' as any },
    { id: '2', name: 'Data Pipeline', desc: 'Process daily CSVs to DB', status: 'running' as any },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Workflows</h1>
        {role !== 'viewer' && (
          <Link href="/workflows/new">
            <Button>+ Create Workflow</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map(wf => (
          <Link key={wf.id} href={`/workflows/${wf.id}`}>
            <Card className="hover:border-indigo-500/50 transition-colors cursor-pointer h-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-lg text-white">{wf.name}</h3>
                <Badge status={wf.status} label={wf.status} />
              </div>
              <p className="text-slate-400 text-sm mb-4 line-clamp-2">{wf.desc}</p>
              <div className="text-xs text-slate-500">
                Last run: 2 hours ago
              </div>
            </Card>
          </Link>
        ))}
        {workflows.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400 border border-dashed border-slate-700 rounded-xl">
            No workflows found. Create your first one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
