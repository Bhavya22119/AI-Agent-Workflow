"use client";

import { NhostProvider as Provider } from '@nhost/react';
import { nhost } from '@/lib/nhost';

export function NhostProvider({ children }: { children: React.ReactNode }) {
  return <Provider nhost={nhost}>{children}</Provider>;
}
