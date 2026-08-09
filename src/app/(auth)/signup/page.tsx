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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const { isSuccess } = await signUpEmailPassword(email, password);
    if (isSuccess) router.push('/workflows');
  };

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold text-center mb-6 text-white">Create Account</h1>
      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-rose-500 text-sm">{error.message}</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : 'Sign Up'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-400">
        Already have an account? <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Log in</Link>
      </p>
    </Card>
  );
}
