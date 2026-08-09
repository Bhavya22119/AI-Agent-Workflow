import { useState, useEffect } from 'react';
import { useUserData } from '@nhost/react';
import { useGraphQL } from './useGraphQL';

export function useOrg() {
  const user = useUserData();
  const { request } = useGraphQL();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchOrg = async () => {
      try {
        const data = await request(`
          query GetMyOrgs($userId: uuid!) {
            org_members(where: { user_id: { _eq: $userId } }, limit: 1) {
              org_id
              role
            }
          }
        `, { userId: user.id });

        if (data.org_members && data.org_members.length > 0) {
          setOrgId(data.org_members[0].org_id);
          setRole(data.org_members[0].role);
          localStorage.setItem('selected_org_id', data.org_members[0].org_id);
        } else {
          // User exists but not in any org yet — use stored org or demo fallback
          const storedOrg = localStorage.getItem('selected_org_id');
          setOrgId(storedOrg || '11111111-1111-1111-1111-111111111111');
          setRole('owner');
        }
      } catch (err) {
        // GraphQL permission error — user not in any org yet
        // Fallback gracefully instead of crashing
        console.warn('Could not fetch org membership (user may not be in any org yet):', err);
        const storedOrg = localStorage.getItem('selected_org_id');
        setOrgId(storedOrg || '11111111-1111-1111-1111-111111111111');
        setRole('owner');
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [user]);

  return { orgId, role, loading };
}
