"use client";
import { useState } from 'react';
import { useSignUpEmailPassword } from '@nhost/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signUpEmailPassword, isLoading, error } = useSignUpEmailPassword();
  const router = useRouter();

  const handleSignup = async () => {
    const { isSuccess } = await signUpEmailPassword(email, password);
    if (isSuccess) window.location.href = '/onboarding';
  };

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold text-center mb-6 text-zinc-900">Create Account</h1>
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
        <Button onClick={handleSignup} className="w-full" disabled={isLoading || !email || !password}>
          {isLoading ? 'Creating account...' : 'Sign Up'}
        </Button>
      </div>
      <p className="mt-4 text-center text-sm text-zinc-500">
        Already have an account? <Link href="/login" className="text-blue-600 hover:text-blue-700">Log in</Link>
      </p>
    </Card>
  );
}
