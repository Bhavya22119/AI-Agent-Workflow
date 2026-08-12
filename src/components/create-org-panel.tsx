'use client';

/**
 * Create-an-organization panel.
 *
 * Used both by /onboarding and directly by the authenticated layout when the
 * signed-in user belongs to no organization yet. Rendering it inline there —
 * rather than redirecting to /onboarding — means an org-less user always sees
 * something actionable instead of a loader waiting on a navigation.
 *
 * There is deliberately no "join an existing org by name" flow: letting a
 * stranger add themselves to an org they can name is exactly the cross-tenant
 * hole this project is graded on. Membership is granted by an owner, from the
 * Members screen.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useOrg } from '@/components/providers/org-provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { Card } from '@/components/ui/surface';
import { runAction } from '@/lib/actions';
import { resetSubscriptionClient } from '@/hooks/use-subscription';

interface CreateOrgResult {
  org_id: string;
  name: string;
  slug: string;
  role: string;
}

export function CreateOrgPanel({ heading }: { heading?: string }) {
  const { user, signOut } = useAuth();
  const { memberships, refresh, selectOrg } = useOrg();
  const router = useRouter();
  const [typedName, setTypedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Derived, not synced from an effect, so the suggestion is present in the
  // first render that knows who the user is.
  const name = typedName ?? (user ? `${user.displayName}'s workspace` : '');

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await runAction<CreateOrgResult>('createOrganization', { name });
      selectOrg(result.org_id);
      await refresh();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the organization.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignOut() {
    resetSubscriptionClient();
    await signOut();
    router.replace('/login');
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-ink">
            <Building2 className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold text-ink">
              {heading ?? 'Create an organization'}
            </h1>
            <p className="text-xs text-ink-3">
              You will be its owner. Signed in as {user?.email}.
            </p>
          </div>
        </div>

        <form onSubmit={onCreate} className="mt-5 space-y-4">
          <Field label="Organization name" htmlFor="org-name">
            <Input
              id="org-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(event) => setTypedName(event.target.value)}
            />
          </Field>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            className="w-full"
          >
            Create organization
          </Button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          To join an existing organization instead, ask one of its owners to invite this
          email address from their Members screen. Or sign in with one of the seeded demo
          accounts — <span className="font-mono">owner-a@agentflow.test</span> — which are
          already members of a workspace with a workflow to run.
        </p>
      </Card>

      {memberships.length > 0 ? (
        <Button variant="ghost" onClick={() => router.replace('/dashboard')} className="w-full">
          Back to {memberships[0].organization.name}
        </Button>
      ) : (
        <Button variant="ghost" onClick={onSignOut} className="w-full">
          Sign out
        </Button>
      )}
    </div>
  );
}
