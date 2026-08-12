'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useOrg } from '@/components/providers/org-provider';
import { RoleBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Card, CardHeader } from '@/components/ui/surface';
import { useQuery } from '@/hooks/use-query';
import { runAction } from '@/lib/actions';
import { ORG_MEMBERS, REMOVE_MEMBER, UPDATE_MEMBER_ROLE } from '@/lib/gql';
import { gqlRequest } from '@/lib/graphql-client';
import { canManageMembers } from '@/lib/step-catalog';
import type { Membership, OrgRole } from '@/lib/types';

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner:
    'Full control: workflows, steps, triggers, membership — and the only role that can add db_write / notify steps or webhook triggers.',
  editor: 'Can create and edit workflows and steps, and can trigger runs. Cannot manage members.',
  viewer: 'Read-only. Cannot trigger a run or approve anything.',
};

export default function MembersPage() {
  const { activeOrgId, activeMembership, role, refresh } = useOrg();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('editor');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const { data, loading, refetch } = useQuery<{ org_members: Membership[] }>(
    ORG_MEMBERS,
    { orgId: activeOrgId },
    { skip: !activeOrgId },
  );

  const members = data?.org_members ?? [];
  const isOwner = canManageMembers(role);

  async function onInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrgId) return;
    setBusy('invite');
    setFeedback(null);
    try {
      await runAction('upsertOrgMember', { org_id: activeOrgId, email, role: inviteRole });
      setEmail('');
      await refetch();
      setFeedback({ tone: 'success', text: `${email} is now ${inviteRole} in this organization.` });
    } catch (err) {
      setFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not add that member.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onChangeRole(memberId: string, nextRole: OrgRole) {
    setBusy(memberId);
    setFeedback(null);
    try {
      await gqlRequest(UPDATE_MEMBER_ROLE, { id: memberId, role: nextRole });
      await refetch();
      await refresh();
    } catch (err) {
      setFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not change that role.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(memberId: string) {
    setBusy(memberId);
    setFeedback(null);
    try {
      await gqlRequest(REMOVE_MEMBER, { id: memberId });
      await refetch();
      await refresh();
    } catch (err) {
      setFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not remove that member.',
      });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <PageLoader label="Loading members…" />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Members</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Roles in {activeMembership?.organization.name}. A role here applies to this organization
          only — the same person can be an owner in one and a viewer in another.
        </p>
      </header>

      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      {isOwner ? (
        <Card className="p-4">
          <form onSubmit={onInvite} className="flex flex-wrap items-end gap-3">
            <Field label="Add by email" className="min-w-56 flex-1" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
              />
            </Field>
            <Field label="Role" className="w-40">
              <Select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as OrgRole)}
              >
                <option value="owner">owner</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" loading={busy === 'invite'}>
              <UserPlus className="size-4" />
              Add member
            </Button>
          </form>
          <p className="mt-2 text-xs text-ink-3">
            They must already have an account. Resolving an email to a user id needs privileged
            access, so this goes through the upsertOrgMember Action, which checks that you are an
            owner of this organization first.
          </p>
        </Card>
      ) : (
        <Alert tone="info">
          Only owners can manage membership. You are {role === 'editor' ? 'an editor' : 'a viewer'}{' '}
          here.
        </Alert>
      )}

      <Card>
        <CardHeader title="People" description={`${members.length} member(s)`} />
        <ul className="divide-y divide-line">
          {members.map((member) => {
            const isSelf = member.user_id === user?.id;
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {member.user?.displayName || member.user?.email || member.user_id}
                    {isSelf ? <span className="ml-1.5 text-xs text-ink-3">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-ink-3">{member.user?.email}</p>
                </div>

                {isOwner ? (
                  <Select
                    aria-label={`Role for ${member.user?.email ?? member.user_id}`}
                    className="w-32"
                    value={member.role}
                    disabled={busy === member.id}
                    onChange={(event) => onChangeRole(member.id, event.target.value as OrgRole)}
                  >
                    <option value="owner">owner</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </Select>
                ) : (
                  <RoleBadge role={member.role} />
                )}

                {isOwner ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    loading={busy === member.id}
                    onClick={() => onRemove(member.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
          An organization must always keep at least one owner — a database trigger rejects the
          change that would remove the last one.
        </p>
      </Card>

      <Card>
        <CardHeader title="What each role can do" />
        <dl className="divide-y divide-line">
          {(['owner', 'editor', 'viewer'] as OrgRole[]).map((item) => (
            <div key={item} className="flex gap-3 px-4 py-2.5">
              <dt className="w-16 shrink-0">
                <RoleBadge role={item} />
              </dt>
              <dd className="text-sm text-ink-2">{ROLE_DESCRIPTIONS[item]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
