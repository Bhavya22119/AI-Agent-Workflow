import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/providers/auth-provider';
import { OrgProvider } from '@/components/providers/org-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Flow — AI workflow builder',
  description:
    'Multi-tenant AI agent workflow builder on Nhost, Hasura and PostgreSQL: chained LLM steps, human approval gates and live run tracking.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <OrgProvider>{children}</OrgProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
