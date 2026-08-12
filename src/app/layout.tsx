import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/providers/auth-provider';
import { OrgProvider } from '@/components/providers/org-provider';
import './globals.css';

/**
 * Geist, self-hosted by `next/font` at build time — no runtime request to Google
 * and no layout shift, and it is what the hero's type was designed against. The
 * variables are consumed by --font-sans / --font-mono in globals.css, so nothing
 * else in the app has to know the font changed.
 */
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Agent Flow — AI workflow builder',
  description:
    'Multi-tenant AI agent workflow builder on Nhost, Hasura and PostgreSQL: chained LLM steps, human approval gates and live run tracking.',
};

export const viewport: Viewport = {
  // Matches --color-canvas in each scheme, so mobile browser chrome does not
  // leave a lighter strip above a true-black page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AuthProvider>
          <OrgProvider>{children}</OrgProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
