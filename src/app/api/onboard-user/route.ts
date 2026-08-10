import { NextRequest, NextResponse } from 'next/server';

const GRAPHQL_URL = `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1'}.nhost.run/v1/graphql`;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

async function adminQuery(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function POST(req: NextRequest) {
  try {
    const { userId, action, orgId, orgName } = await req.json();

    if (!userId || !action) {
      return NextResponse.json({ message: 'userId and action are required' }, { status: 400 });
    }

    // Check if user already has an org
    const memberData = await adminQuery(`
      query($userId: uuid!) {
        org_members(where: { user_id: { _eq: $userId } }) { org_id }
      }
    `, { userId });

    if (memberData.org_members?.length > 0) {
      // User is already in an org, just return it
      return NextResponse.json({ org_id: memberData.org_members[0].org_id });
    }

    if (action === 'create') {
      if (!orgName) return NextResponse.json({ message: 'orgName is required to create' }, { status: 400 });
      
      const newOrgId = uuidv4();
      await adminQuery(`
        mutation($orgId: uuid!, $userId: uuid!, $name: String!) {
          insert_organizations_one(object: {
            id: $orgId, name: $name, quota_allowed: 100, quota_used: 0
          }) { id }
          insert_org_members_one(object: {
            org_id: $orgId, user_id: $userId, role: "owner"
          }) { id }
        }
      `, { orgId: newOrgId, userId, name: orgName });
      
      return NextResponse.json({ org_id: newOrgId, role: 'owner' });
    } 
    
    else if (action === 'join') {
      if (!orgId) return NextResponse.json({ message: 'orgId is required to join' }, { status: 400 });
      
      await adminQuery(`
        mutation($orgId: uuid!, $userId: uuid!) {
          insert_org_members_one(object: {
            org_id: $orgId, user_id: $userId, role: "viewer"
          }) { id }
        }
      `, { orgId, userId });
      
      return NextResponse.json({ org_id: orgId, role: 'viewer' });
    }

    return NextResponse.json({ message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('onboard-user API error:', error);
    return NextResponse.json({ message: error.message || 'Internal error' }, { status: 500 });
  }
}
