'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, KPICard } from '@/components/common/Card';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { api } from '@/lib/api';
import { AlertCircle, Loader, RefreshCw } from 'lucide-react';

export default function APIUsagePage() {
  const [usageData, setUsageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const data = await api.usage.get(30);
      setUsageData(data);
    } catch (e) {
      console.error('Failed to load API usage', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <MainLayout title="API Usage" breadcrumbs={[{ label: 'API Usage' }]}>
          <div className="flex items-center justify-center h-64">
            <Loader className="animate-spin text-gray-400" size={32} />
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!usageData) {
    return (
      <ProtectedRoute>
        <MainLayout title="API Usage" breadcrumbs={[{ label: 'API Usage' }]}>
          <Card><p className="text-gray-400 text-center py-8">Failed to load usage data</p></Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const { daily, summary } = usageData;
  const chartData = daily.map((d: any) => ({
    date: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: d.api_calls,
    cost: d.cost,
  }));

  const recent = daily.slice(-14);

  return (
    <ProtectedRoute>
    <MainLayout title="API Usage" breadcrumbs={[{ label: 'API Usage' }]}>
      <div className="space-y-6">
        {/* Refresh Button */}
        <div className="flex justify-end">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth disabled:opacity-40">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Current Usage"
            value={`${summary.usage_percentage.toFixed(1)}%`}
            subtext={`${summary.today_calls} calls today`}
          />
          <KPICard
            label="Total Cost"
            value={`$${summary.total_cost.toFixed(2)}`}
            subtext="All time"
          />
          <KPICard
            label="Quota"
            value={summary.quota.toLocaleString()}
            subtext="Total available"
          />
          <KPICard
            label="Remaining"
            value={(summary.quota - summary.total_calls).toLocaleString()}
            subtext={`${((summary.quota - summary.total_calls) / summary.quota * 100).toFixed(1)}% free`}
          />
        </div>

        {summary.usage_percentage > 75 && (
          <Card className="border-l-4 border-yellow-500 bg-yellow-950/20">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-white mb-1">High API Usage Alert</h3>
                <p className="text-gray-400">
                  Your API usage is at {summary.usage_percentage.toFixed(1)}% of your quota.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-white">Usage Trend (30 days)</h3>
            <p className="text-sm text-gray-400 mt-1">API calls per day</p>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b8b5b0" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#b8b5b0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(229, 226, 225, 0.1)" vertical={false} />
              <XAxis dataKey="date" stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
              <YAxis stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(229, 226, 225, 0.1)', borderRadius: '8px' }} labelStyle={{ color: '#e5e2e1' }} />
              <Legend />
              <Area type="monotone" dataKey="calls" stroke="#b8b5b0" fillOpacity={1} fill="url(#colorUsage)" name="API Calls" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white">Daily API Calls</h3>
              <p className="text-sm text-gray-400 mt-1">Last 14 days</p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={recent}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(229, 226, 225, 0.1)" vertical={false} />
                <XAxis dataKey="date" stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
                <YAxis stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(229, 226, 225, 0.1)', borderRadius: '8px' }} labelStyle={{ color: '#e5e2e1' }} />
                <Bar dataKey="calls" fill="#b8b5b0" radius={[4, 4, 0, 0]} name="API Calls" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white">Daily Cost</h3>
              <p className="text-sm text-gray-400 mt-1">Last 14 days</p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={recent}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(229, 226, 225, 0.1)" vertical={false} />
                <XAxis dataKey="date" stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
                <YAxis stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(229, 226, 225, 0.1)', borderRadius: '8px' }} labelStyle={{ color: '#e5e2e1' }} />
                <Line type="monotone" dataKey="cost" stroke="#b8b5b0" dot={false} strokeWidth={2} name="Cost ($)" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-bold text-white mb-4">Usage Breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'Voice Calls', pct: 60, color: 'bg-blue-500' },
                { label: 'Text Processing', pct: 25, color: 'bg-purple-500' },
                { label: 'Analytics', pct: 10, color: 'bg-pink-500' },
                { label: 'Other', pct: 5, color: 'bg-gray-500' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="text-gray-400">{item.label}</span>
                    <span className="text-white">{item.pct}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-white mb-4">Cost Estimate</h3>
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Today</span>
                <span className="text-white font-semibold">${(summary.today_calls * 0.01).toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Total All Time</span>
                <span className="text-white font-semibold">${summary.total_cost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Avg Daily Cost</span>
                <span className="text-white font-semibold">${(summary.total_cost / Math.max(daily.length, 1)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-3 bg-green-950/20 rounded-lg border border-green-800">
                <span className="text-green-400">Quota Remaining</span>
                <span className="text-green-300 font-semibold">{(summary.quota - summary.total_calls).toLocaleString()} calls</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
    </ProtectedRoute>
  );
}