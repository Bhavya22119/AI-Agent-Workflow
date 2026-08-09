"use client";
import { Card } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Organization Settings</h1>
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">General</h2>
        <p className="text-slate-400">Settings and preferences for your organization.</p>
      </Card>
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">Members</h2>
        <p className="text-slate-400">Manage who has access to your organization.</p>
      </Card>
    </div>
  );
}
