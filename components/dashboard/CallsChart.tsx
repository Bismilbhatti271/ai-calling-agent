'use client';

import { Card } from '@/components/common/Card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLiveDashboardData } from '@/lib/live-data';

export function CallsChart() {
  const { data, loading } = useLiveDashboardData();

  const chartData = data.calls_by_day.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: d.count,
  }));

  return (
    <Card className="col-span-2">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Calls Overview</h3>
        <p className="text-sm text-gray-400 mt-1">{loading ? 'Loading live calls…' : 'Live — last 7 days'}</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Line type="monotone" dataKey="calls" stroke="#b8b5b0" dot={false} strokeWidth={2} name="Calls" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
