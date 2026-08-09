import { useState, useEffect } from 'react';

export function useOrg() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);

  useEffect(() => {
    // In a real app, you might fetch all orgs the user belongs to and pick the first or let them choose.
    // Here we assume a static ID or fetch from local storage for demo purposes
    const storedOrgId = localStorage.getItem('selected_org_id') || '00000000-0000-0000-0000-000000000000';
    setOrgId(storedOrgId);
    
    // Simulate fetching role
    setRole('owner');
  }, []);

  return { orgId, role };
}
