"use client";
import { useState } from 'react';
import { useSignInEmailPassword } from '@nhost/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInEmailPassword, isLoading, error } = useSignInEmailPassword();
  const router = useRouter();

  const handleLogin = async () => {
    const result = await signInEmailPassword(email, password);
    if (!result.error) window.location.href = '/workflows';
  };

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold text-center mb-6 text-zinc-900">Welcome Back</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-600 mb-1">Email</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-600 mb-1">Password</label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-rose-500 text-sm">{error.message}</p>}
        <Button onClick={handleLogin} className="w-full" disabled={isLoading || !email || !password}>
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </div>
      <p className="mt-4 text-center text-sm text-zinc-500">
        Don't have an account? <Link href="/signup" className="text-blue-600 hover:text-blue-700">Sign up</Link>
      </p>
      <p className="mt-2 text-center text-sm text-zinc-500">
        <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700">Forgot your password?</Link>
      </p>
    </Card>
  );
}
