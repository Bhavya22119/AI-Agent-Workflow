import { NextRequest, NextResponse } from 'next/server';
import { adminQuery } from '@/lib/engine/graphql';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { orgId } = body;

    if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

    const graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`;

    // 1. Verify user belongs to this org
    const userRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        query: `
          query GetUserRole($orgId: uuid!) {
            org_members(where: { org_id: { _eq: $orgId } }) {
              role
            }
          }
        `,
        variables: { orgId }
      })
    });
    
    const userData = await userRes.json();
    const member = userData.data?.org_members?.[0];
    
    if (userData.errors || !member || member.role === 'pending') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Fetch all members for the org
    // Since we don't have a direct GraphQL relationship from public.org_members to auth.users,
    // we fetch members first, then fetch users.
    const membersData = await adminQuery(`
      query GetOrgMembers($orgId: uuid!) {
        org_members(where: { org_id: { _eq: $orgId } }) {
          id
          user_id
          role
          created_at
        }
      }
    `, { orgId });

    const orgMembers = membersData.org_members || [];
    const userIds = orgMembers.map((m: any) => m.user_id);

    // Fetch user details from auth.users (requires admin)
    const usersData = await adminQuery(`
      query GetUsers($userIds: [uuid!]!) {
        users(where: { id: { _in: $userIds } }) {
          id
          displayName
          email
        }
      }
    `, { userIds });

    const users = usersData.users || [];
    const userMap = users.reduce((acc: any, u: any) => {
      acc[u.id] = u;
      return acc;
    }, {});

    const enrichedMembers = orgMembers.map((m: any) => ({
      ...m,
      user: userMap[m.user_id] || { displayName: 'Unknown User', email: '' }
    }));

    return NextResponse.json({ members: enrichedMembers });
  } catch (error: any) {
    console.error('Fetch members error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
