'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { KPICards } from '@/components/dashboard/KPICards';
import { CallsChart } from '@/components/dashboard/CallsChart';
import { ConversionChart } from '@/components/dashboard/ConversionChart';
import { RecentCalls } from '@/components/dashboard/RecentCalls';
import { StartCallCard } from '@/components/dashboard/StartCallCard';
import { RefreshCw } from 'lucide-react';
import { useLiveDashboardData } from '@/lib/live-data';

export default function Page() {
  const { refresh, error } = useLiveDashboardData();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ProtectedRoute>
      <MainLayout title="Dashboard" breadcrumbs={[{ label: 'Home' }]}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-1">Welcome to Empire-X AI Calling Platform</p>
            </div>
            <div className="flex items-center gap-3">
              {error && (
                <span className="text-xs text-red-400 bg-red-900/20 px-3 py-1.5 rounded-md border border-red-800/40">
                  {error}
                </span>
              )}
              <button onClick={handleRefresh} disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-40">
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <KPICards />

          <StartCallCard />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CallsChart />
            <ConversionChart />
          </div>

          <RecentCalls />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
