"use client";
import { useState, useEffect } from 'react';
import { useChangePassword } from '@nhost/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const { changePassword, isLoading, error, isSuccess } = useChangePassword();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const urlError = searchParams.get('error');
  const urlErrorDescription = searchParams.get('errorDescription');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    await changePassword(newPassword);
  };

  if (isSuccess) {
    return (
      <Card className="p-8 text-center">
        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold mb-2 text-white">Password Updated!</h1>
        <p className="text-slate-300 mb-6">Your password has been changed successfully.</p>
        <Link href="/login">
          <Button className="w-full">Go to Log in</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold text-center mb-6 text-white">Set New Password</h1>
      
      {urlError && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-rose-500 text-sm text-center">
          {urlErrorDescription || 'Invalid or expired password reset link.'}
          <div className="mt-2">
            <Link href="/forgot-password" className="underline font-medium hover:text-rose-400">
              Request a new link
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
          <Input 
            type="password" 
            value={newPassword} 
            onChange={e => setNewPassword(e.target.value)} 
            required 
            minLength={8}
            disabled={!!urlError}
          />
        </div>
        
        {error && <p className="text-rose-500 text-sm">{error.message}</p>}
        
        <Button type="submit" className="w-full" disabled={isLoading || !newPassword || !!urlError}>
          {isLoading ? 'Updating...' : 'Update Password'}
        </Button>
      </form>
    </Card>
  );
}
