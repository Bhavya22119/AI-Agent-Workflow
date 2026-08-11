"use client";
import { useEffect, useState } from 'react';
import { useOrg } from '@/hooks/useOrg';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { nhost } from '@/lib/nhost';

type Member = {
  id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer' | 'pending';
  created_at: string;
  user: {
    displayName: string;
    email: string;
  };
};

export default function MembersPage() {
  const { orgId, role: currentRole } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!orgId) return;
    try {
      const token = await nhost.auth.getAccessToken();
      const res = await fetch('/api/get-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orgId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMembers(data.members);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [orgId]);

  const handleAction = async (targetUserId: string, action: string, newRole?: string) => {
    try {
      const token = await nhost.auth.getAccessToken();
      const res = await fetch('/api/manage-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orgId, targetUserId, action, role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Refresh the list
      fetchMembers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div>Loading members...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  const isOwner = currentRole === 'owner';

  if (!isOwner) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-2xl font-bold text-zinc-900">Access Restricted</h1>
          <p className="text-zinc-500">Only organization owners can view and manage members.</p>
        </div>
      </div>
    );
  }

  const activeMembers = members.filter(m => m.role !== 'pending');
  const pendingMembers = members.filter(m => m.role === 'pending');

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Organization Members</h1>
      </div>

      {pendingMembers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30 p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-amber-800">Pending Approvals ({pendingMembers.length})</h3>
          </div>
          <div>
            <div className="space-y-4">
              {pendingMembers.map(member => (
                <div key={member.id} className="flex items-center justify-between bg-white p-4 rounded-lg border border-amber-100 shadow-sm">
                  <div>
                    <div className="font-semibold text-zinc-900">{member.user.displayName}</div>
                    <div className="text-sm text-zinc-500">{member.user.email}</div>
                  </div>
                  {isOwner && (
                    <div className="flex gap-2">
                      <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleAction(member.user_id, 'reject')}>Reject</Button>
                      <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handleAction(member.user_id, 'approve')}>Approve as Viewer</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-zinc-900">Active Members</h3>
        </div>
        <div>
          <div className="divide-y divide-zinc-200">
            {activeMembers.map(member => (
              <div key={member.id} className="flex items-center justify-between py-4">
                <div>
                  <div className="font-semibold text-zinc-900">{member.user.displayName}</div>
                  <div className="text-sm text-zinc-500">{member.user.email}</div>
                </div>
                <div className="flex items-center gap-4">
                  {isOwner && member.role !== 'owner' ? (
                    <select
                      className="border-zinc-200 rounded-md text-sm p-1.5 focus:ring-zinc-900 focus:border-zinc-900"
                      value={member.role}
                      onChange={(e) => handleAction(member.user_id, 'update_role', e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 capitalize border border-zinc-200 shadow-sm">
                      {member.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
