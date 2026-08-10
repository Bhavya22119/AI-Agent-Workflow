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
    const data = await adminQuery(`
      query GetOrganizations {
        organizations(order_by: { created_at: desc }) {
          id
          name
        }
      }
    `);
    
    return NextResponse.json(data.organizations || []);
  } catch (error: any) {
    console.error('organizations API error:', error);
    return NextResponse.json({ message: error.message || 'Internal error' }, { status: 500 });
  }
}
