'use client';

import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Table } from '@/components/common/Table';
import { useLiveDashboardData } from '@/lib/live-data';

export function RecentCalls() {
  const { data, loading } = useLiveDashboardData();
  const recentCalls = data.recent_calls;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case 'conversion':
        return 'success';
      case 'transferred':
        return 'success';
      case 'declined':
        return 'error';
      default:
        return 'warning';
    }
  };

  const columns = [
    {
      key: 'customer_name',
      label: 'Name',
      render: (value: string) => <span className="text-sm font-medium">{value || '-'}</span>,
    },
    {
      key: 'phone_number',
      label: 'Phone',
      render: (value: string) => <span className="font-mono text-sm">{value}</span>,
    },
    {
      key: 'agent_name',
      label: 'Agent',
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      key: 'age_collected',
      label: 'Age',
      render: (value: number | null) => (
        <span>{value !== null ? value : '-'}</span>
      ),
    },
    {
      key: 'result',
      label: 'Result',
      render: (value: string) => (
        <Badge variant={getResultColor(value)}>
          {value === 'transferred' ? 'TRANSFERRED' : value.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'duration_seconds',
      label: 'Duration',
      render: (value: number) => (
        <span>
          {value > 0 ? `${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, '0')}` : '-'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Time',
      render: (value: string) => (
        <span className="text-gray-400">
          {new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Recent Calls</h3>
        <p className="text-sm text-gray-400 mt-1">
          {loading
            ? 'Loading live calls…'
            : recentCalls.length
            ? `Live — last ${recentCalls.length} calls`
            : 'No calls yet — call your Twilio number to see it appear here'}
        </p>
      </div>

      <Table columns={columns} data={recentCalls} keyExtractor={(item) => item.id} />
    </Card>
  );
}
