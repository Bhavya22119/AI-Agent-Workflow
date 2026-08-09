import { NhostClient } from '@nhost/react';

const isBrowser = typeof window !== 'undefined';

const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local',
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
  // For local development
  ...(process.env.NEXT_PUBLIC_NHOST_BACKEND_URL ? {
    backendUrl: process.env.NEXT_PUBLIC_NHOST_BACKEND_URL,
  } : {}),
  clientStorageType: 'custom',
  clientStorage: {
    getItem: (key) => {
      if (!isBrowser) return null;
      const val = window.localStorage.getItem(key);
      console.log(`[Nhost Storage] getItem(${key}) =`, val ? '***' : null);
      return val;
    },
    setItem: (key, value) => {
      if (!isBrowser) return;
      console.log(`[Nhost Storage] setItem(${key}, ***)`);
      window.localStorage.setItem(key, value);
    },
    removeItem: (key) => {
      if (!isBrowser) return;
      console.log(`[Nhost Storage] removeItem(${key})`);
      window.localStorage.removeItem(key);
    }
  }
});

export { nhost };
