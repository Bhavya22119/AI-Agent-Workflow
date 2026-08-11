import { NextRequest, NextResponse } from 'next/server';
import { adminQuery } from '@/lib/engine/graphql';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { targetUserId, action, role: newRole, orgId } = body;

    if (!targetUserId || !action || !orgId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`;

    // Verify requester is an owner
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
    
    if (userData.errors || !member || member.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can manage members.' }, { status: 403 });
    }

    // Prevent modifying an owner
    const targetRes = await adminQuery(`
      query GetTargetRole($orgId: uuid!, $userId: uuid!) {
        org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }) {
          role
        }
      }
    `, { orgId, userId: targetUserId });
    
    const targetMember = targetRes.org_members?.[0];
    if (!targetMember) {
      return NextResponse.json({ error: 'Target member not found' }, { status: 404 });
    }
    
    if (targetMember.role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify an owner account' }, { status: 403 });
    }

    if (action === 'approve') {
      await adminQuery(`
        mutation ApproveMember($orgId: uuid!, $userId: uuid!) {
          update_org_members(
            where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } },
            _set: { role: "viewer" }
          ) { affected_rows }
        }
      `, { orgId, userId: targetUserId });
      return NextResponse.json({ success: true, message: 'Member approved' });
    }
    
    if (action === 'reject') {
      await adminQuery(`
        mutation RejectMember($orgId: uuid!, $userId: uuid!) {
          delete_org_members(
            where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }
          ) { affected_rows }
        }
      `, { orgId, userId: targetUserId });
      return NextResponse.json({ success: true, message: 'Member rejected' });
    }

    if (action === 'update_role') {
      if (!['owner', 'editor', 'viewer'].includes(newRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      
      await adminQuery(`
        mutation UpdateRole($orgId: uuid!, $userId: uuid!, $role: org_role!) {
          update_org_members(
            where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } },
            _set: { role: $role }
          ) { affected_rows }
        }
      `, { orgId, userId: targetUserId, role: newRole });
      return NextResponse.json({ success: true, message: 'Role updated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Member management error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
