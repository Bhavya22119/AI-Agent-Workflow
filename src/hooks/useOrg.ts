import { useState, useEffect } from 'react';
import { useUserData } from '@nhost/react';
import { useGraphQL } from './useGraphQL';
import { Role } from '@/lib/types';

export function useOrg() {
  const user = useUserData();
  const { request } = useGraphQL();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let isMounted = true;

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

        if (isMounted) {
          if (data.org_members && data.org_members.length > 0) {
            setOrgId(data.org_members[0].org_id);
            setRole(data.org_members[0].role);
            localStorage.setItem('selected_org_id', data.org_members[0].org_id);
          } else {
            // User is not in any org — redirect to onboarding to join/create one
            if (window.location.pathname !== '/onboarding') {
              window.location.href = '/onboarding';
            } else {
              setOrgId(null);
              setRole(null);
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch org membership:', err);
        if (isMounted) {
          setOrgId(null);
          setRole(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrg();

    return () => { isMounted = false; };
  }, [user]);

  return { orgId, role, loading };
}
