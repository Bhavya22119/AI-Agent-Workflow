'use client';

import { RequireAuth } from '@/components/require-auth';

/**
 * The workflow editor gets its own layout: no sidebar and no page container, so
 * the canvas can use the whole window. Building a graph is the one screen where
 * space genuinely matters — the node palette and the inspector both sit over the
 * canvas, and on the dashboard's 6xl-wide container they left the working area
 * uncomfortably narrow.
 */
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="h-dvh overflow-hidden bg-canvas">{children}</div>
    </RequireAuth>
  );
}
