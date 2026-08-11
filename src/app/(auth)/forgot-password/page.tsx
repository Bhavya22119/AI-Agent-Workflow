"use client";
import { useState } from 'react';
import { useResetPassword } from '@nhost/react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const { resetPassword, isLoading, error, isSent } = useResetPassword();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    await resetPassword(email, {
      redirectTo: '/reset-password' // Redirect URL in the email link
    });
  };

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold text-center mb-6 text-white">Reset Password</h1>
      
      {isSent ? (
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <h2 className="text-lg font-medium text-white">Check your email</h2>
          <p className="text-sm text-slate-300">
            We've sent password reset instructions to <strong>{email}</strong>.
          </p>
          <div className="pt-4">
            <Link href="/login">
              <Button variant="ghost" className="w-full text-white hover:text-white border border-slate-700">
                Back to Log in
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-sm text-slate-300 mb-4">
            Enter the email address associated with your account and we'll send you a link to reset your password.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email address</label>
            <Input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="name@example.com"
              required 
            />
          </div>
          {error && <p className="text-rose-500 text-sm">{error.message}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || !email}>
            {isLoading ? 'Sending...' : 'Send reset link'}
          </Button>
          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="text-slate-400 hover:text-slate-300 transition-colors">
              &larr; Back to Log in
            </Link>
          </div>
        </form>
      )}
    </Card>
  );
}
