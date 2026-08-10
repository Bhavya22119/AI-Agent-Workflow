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
            // Auto-provision an organization for the new user
            try {
              const res = await fetch('/api/provision-org', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, email: user.email })
              });
              
              if (res.ok) {
                const provisionData = await res.json();
                setOrgId(provisionData.org_id);
                setRole('owner'); // Provisioned users are owners of their new org
                localStorage.setItem('selected_org_id', provisionData.org_id);
              } else {
                setOrgId(null);
                setRole(null);
              }
            } catch (provisionErr) {
              console.error('Auto-provisioning failed:', provisionErr);
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
