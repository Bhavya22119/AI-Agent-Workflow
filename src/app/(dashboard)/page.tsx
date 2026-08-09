"use client";
import { Card } from '@/components/ui/card';
import { useOrg } from '@/hooks/useOrg';

export default function DashboardPage() {
  const { role } = useOrg();
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Total Workflows</h3>
          <p className="text-3xl font-bold text-white">12</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Runs this month</h3>
          <p className="text-3xl font-bold text-white">1,204</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Quota Usage</h3>
          <div className="mt-2 h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 w-[45%]" />
          </div>
          <p className="text-xs text-slate-400 mt-2">45% (45,000 / 100,000 runs)</p>
        </Card>
      </div>
      
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
        <div className="text-slate-400 text-sm">
          No recent activity to show.
        </div>
      </Card>
    </div>
  );
}
