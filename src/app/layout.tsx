import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { NhostProvider } from '@/components/providers/nhost-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Agent Workflow Builder',
  description: 'Build and manage AI workflows',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
        <NhostProvider>
          {children}
        </NhostProvider>
      </body>
    </html>
  );
}
