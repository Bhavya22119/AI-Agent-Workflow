import { NhostClient } from '@nhost/nextjs';

const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local',
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
  // For local development
  ...(process.env.NEXT_PUBLIC_NHOST_BACKEND_URL ? {
    backendUrl: process.env.NEXT_PUBLIC_NHOST_BACKEND_URL,
  } : {}),
});

export { nhost };
