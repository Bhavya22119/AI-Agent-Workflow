'use client';

/**
 * Organization context: which orgs the signed-in user belongs to, which one is
 * selected, and their role in it.
 *
 * The membership list comes straight from `org_members` with no client-side
 * filter — Hasura's row permission already restricts it to the caller's own
 * memberships, so this query returns exactly the orgs they may see. The role
 * held here drives what the UI offers; it is not what enforces anything.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { MY_MEMBERSHIPS } from '@/lib/gql';
import type { Membership, OrgRole } from '@/lib/types';
import { useAuth } from './auth-provider';

const STORAGE_KEY = 'wf.selected_org';

interface OrgContextValue {
  memberships: Membership[];
  activeOrgId: string | null;
  activeMembership: Membership | null;
  role: OrgRole | null;
  loading: boolean;
  error: string | null;
  selectOrg: (orgId: string) => void;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const EMPTY_MEMBERSHIPS: Membership[] = [];

interface LoadedState {
  /** Which (user, reload) this data belongs to — used to derive `loading`. */
  key: string;
  memberships: Membership[];
  error: string | null;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loaded, setLoaded] = useState<LoadedState>({ key: '', memberships: [], error: null });
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const loadKey = ready && user ? `${user.id}|${reloadNonce}` : '';

  useEffect(() => {
    if (!loadKey) return;
    let cancelled = false;

    gqlRequest<{ org_members: Membership[] }>(MY_MEMBERSHIPS)
      .then((data) => {
        if (!cancelled) setLoaded({ key: loadKey, memberships: data.org_members, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoaded({
            key: loadKey,
            memberships: [],
            error:
              error instanceof Error ? error.message : 'Could not load your organizations.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const fresh = loadKey !== '' && loaded.key === loadKey;
  // Memoised so the empty-array case is referentially stable and the derived
  // useMemos below do not recompute on every render.
  const memberships = useMemo(
    () => (fresh ? loaded.memberships : EMPTY_MEMBERSHIPS),
    [fresh, loaded.memberships],
  );

  const selectOrg = useCallback((orgId: string) => {
    setSelectedOrgId(orgId);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, orgId);
  }, []);

  const refresh = useCallback(async () => {
    setReloadNonce((value) => value + 1);
  }, []);

  // The active org is derived, not stored: the explicit selection if it is still
  // one of our memberships, else whatever was remembered, else the first.
  const activeOrgId = useMemo(() => {
    const ids = memberships.map((membership) => membership.org_id);
    if (selectedOrgId && ids.includes(selectedOrgId)) return selectedOrgId;
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (stored && ids.includes(stored)) return stored;
    return ids[0] ?? null;
  }, [memberships, selectedOrgId]);

  const activeMembership = useMemo(
    () => memberships.find((membership) => membership.org_id === activeOrgId) ?? null,
    [memberships, activeOrgId],
  );

  const value = useMemo<OrgContextValue>(
    () => ({
      memberships,
      activeOrgId,
      activeMembership,
      role: activeMembership?.role ?? null,
      loading: Boolean(user) && !fresh,
      error: fresh ? loaded.error : null,
      selectOrg,
      refresh,
    }),
    [memberships, activeOrgId, activeMembership, user, fresh, loaded.error, selectOrg, refresh],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) throw new Error('useOrg must be used inside <OrgProvider>.');
  return context;
}
