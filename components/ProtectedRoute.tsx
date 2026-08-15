'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) {
      router.push('/login');
    }
  }, [isLoggedIn, isHydrated, router]);

  if (!isHydrated) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoggedIn, user, isHydrated } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) {
      router.push('/login');
    } else if (user?.role !== 'admin') {
      router.push('/');
    }
  }, [isLoggedIn, user, isHydrated, router]);

  if (!isHydrated || !isLoggedIn || user?.role !== 'admin') {
    return null; // Redirect in progress
  }

  return <>{children}</>;
}

export function UserRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoggedIn, user, isHydrated } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) {
      router.push('/login');
    } else if (user?.role !== 'user') {
      router.push('/');
    }
  }, [isLoggedIn, user, isHydrated, router]);

  if (!isHydrated || !isLoggedIn || user?.role !== 'user') {
    return null; // Redirect in progress
  }

  return <>{children}</>;
}
