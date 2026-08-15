'use client';

import { Card } from '@/components/common/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLiveDashboardData } from '@/lib/live-data';

export function ConversionChart() {
  const { data, loading } = useLiveDashboardData();

  const chartData = data.calls_by_day.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    conversions: d.conversions,
    rate: d.conversion_rate,
  }));

  return (
    <Card>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Conversion Trend</h3>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? 'Loading live calls…' : 'Live — conversions & rates'}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#b8b5b0" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#b8b5b0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(229, 226, 225, 0.1)" vertical={false} />
          <XAxis dataKey="date" stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: '#888888' }} />
          <YAxis
            stroke="#888888"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#888888' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid rgba(229, 226, 225, 0.1)',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#e5e2e1' }}
          />
          <Area
            type="monotone"
            dataKey="conversions"
            stroke="#b8b5b0"
            fillOpacity={1}
            fill="url(#colorConversions)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
