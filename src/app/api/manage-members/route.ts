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

export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get('orgId');
    const userId = req.nextUrl.searchParams.get('userId');

    if (!orgId || !userId) {
      return NextResponse.json({ message: 'orgId and userId required' }, { status: 400 });
    }

    // 1. Verify caller belongs to the org
    const callerData = await adminQuery(`
      query($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { role }
      }
    `, { userId, orgId });

    if (!callerData.org_members?.length) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // 2. Fetch all members via admin query
    const membersData = await adminQuery(`
      query($orgId: uuid!) {
        org_members(where: { org_id: { _eq: $orgId } }) {
          id
          user_id
          role
        }
      }
    `, { orgId });

    return NextResponse.json(membersData.org_members || []);
  } catch (error: any) {
    console.error('manage-members GET API error:', error);
    return NextResponse.json({ message: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, callerUserId, orgId, targetMemberId, newRole } = await req.json();

    if (!callerUserId || !orgId) {
      return NextResponse.json({ message: 'Missing caller credentials' }, { status: 400 });
    }

    // 1. Verify the caller is an owner of the organization
    const callerData = await adminQuery(`
      query($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId }, role: { _eq: "owner" } }) { id }
      }
    `, { userId: callerUserId, orgId });

    if (!callerData.org_members?.length) {
      return NextResponse.json({ message: 'Insufficient permissions. Must be an owner.' }, { status: 403 });
    }

    // 2. Perform the action
    if (action === 'update_role') {
      if (!targetMemberId || !newRole) {
        return NextResponse.json({ message: 'targetMemberId and newRole required' }, { status: 400 });
      }
      
      // Ensure we don't accidentally update members from other orgs
      await adminQuery(`
        mutation($id: uuid!, $orgId: uuid!, $role: String!) {
          update_org_members(where: { id: { _eq: $id }, org_id: { _eq: $orgId } }, _set: { role: $role }) { affected_rows }
        }
      `, { id: targetMemberId, orgId, role: newRole });
      
      return NextResponse.json({ success: true });
    }
    else if (action === 'remove_member') {
      if (!targetMemberId) return NextResponse.json({ message: 'targetMemberId required' }, { status: 400 });
      
      // Ensure we don't remove members from other orgs
      await adminQuery(`
        mutation($id: uuid!, $orgId: uuid!) {
          delete_org_members(where: { id: { _eq: $id }, org_id: { _eq: $orgId } }) { affected_rows }
        }
      `, { id: targetMemberId, orgId });
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('manage-members API error:', error);
    return NextResponse.json({ message: error.message || 'Internal error' }, { status: 500 });
  }
}
