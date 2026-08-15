'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, KPICard } from '@/components/common/Card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

export default function AnalyticsPage() {
  const [data, setData] = useState<any[]>([]);
  const [today, setToday] = useState<any>(null);
  const [yesterday, setYesterday] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const raw = await api.dashboard.analytics(30);
      const mapped = raw.map((d) => ({
        date: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calls: d.calls_completed,
        conversions: d.conversions,
        failed: d.calls_failed,
        rate: d.conversion_rate,
        duration: d.avg_duration,
      }));
      setData(mapped);
      if (raw.length >= 2) {
        const last = raw[raw.length - 1];
        const prev = raw[raw.length - 2];
        setToday(last);
        setYesterday(prev);
      }
    } catch (e) {
      console.error('Failed to load analytics', e);
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
        <MainLayout title="Analytics" breadcrumbs={[{ label: 'Analytics' }]}>
          <p className="text-gray-500 text-center py-12">Loading analytics...</p>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const callsChange = today && yesterday
    ? ((today.calls_completed - yesterday.calls_completed) / yesterday.calls_completed) * 100
    : 0;
  const conversionChange = today && yesterday
    ? ((today.conversions - yesterday.conversions) / yesterday.conversions) * 100
    : 0;
  const failureRate = today && (today.calls_completed + today.calls_failed) > 0
    ? (today.calls_failed / (today.calls_completed + today.calls_failed)) * 100
    : 0;

  return (
    <ProtectedRoute>
    <MainLayout title="Analytics" breadcrumbs={[{ label: 'Analytics' }]}>
        <div className="space-y-6">
        {/* Refresh Button */}
        <div className="flex justify-end">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth disabled:opacity-40">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Calls"
            value={today ? today.calls_completed.toLocaleString() : '0'}
            subtext="Today"
            trend={today && yesterday ? {
              value: Math.abs(Math.round(callsChange)),
              direction: callsChange >= 0 ? 'up' : 'down',
            } : undefined}
          />
          <KPICard
            label="Conversions"
            value={today ? today.conversions : '0'}
            subtext={`${today ? today.conversion_rate : 0}% rate`}
            trend={today && yesterday ? {
              value: Math.abs(Math.round(conversionChange)),
              direction: conversionChange >= 0 ? 'up' : 'down',
            } : undefined}
          />
          <KPICard
            label="Failed Calls"
            value={today ? today.calls_failed : '0'}
            subtext={`${failureRate.toFixed(1)}% failure rate`}
          />
          <KPICard
            label="Avg Duration"
            value={today ? `${Math.floor(today.avg_duration / 60)}:${(today.avg_duration % 60).toString().padStart(2, '0')}` : '0:00'}
            subtext="Per call"
          />
        </div>

        {/* Call Volume & Conversions */}
        <Card className="col-span-full">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-white">
              Call Volume & Conversions
            </h3>
            <p className="text-sm text-gray-400 mt-1">Last 30 days</p>
          </div>

          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(229, 226, 225, 0.1)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="#888888"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#888888' }}
              />
              <YAxis
                yAxisId="left"
                stroke="#888888"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#888888' }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#888888"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#888888' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid rgba(229, 226, 225, 0.1)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e5e2e1' }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="calls"
                stroke="#b8b5b0"
                dot={false}
                strokeWidth={2}
                name="Total Calls"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rate"
                stroke="#888888"
                dot={false}
                strokeWidth={2}
                name="Conv. Rate (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Calls and Failed Calls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white">Completed vs Failed</h3>
              <p className="text-sm text-gray-400 mt-1">Last 14 days</p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.slice(-14)}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(229, 226, 225, 0.1)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#888888"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#888888' }}
                />
                <YAxis
                  stroke="#888888"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#888888' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(229, 226, 225, 0.1)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e5e2e1' }}
                />
                <Bar
                  dataKey="calls"
                  fill="#b8b5b0"
                  name="Completed"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white">Conversion Rate Trend</h3>
              <p className="text-sm text-gray-400 mt-1">Last 14 days</p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.slice(-14)}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(229, 226, 225, 0.1)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#888888"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#888888' }}
                />
                <YAxis
                  stroke="#888888"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#888888' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(229, 226, 225, 0.1)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e5e2e1' }}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#b8b5b0"
                  dot={false}
                  strokeWidth={2}
                  name="Conversion Rate (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </MainLayout>
    </ProtectedRoute>
  );
}
