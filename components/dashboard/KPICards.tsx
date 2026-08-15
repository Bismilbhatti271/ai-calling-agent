'use client';

import { KPICard } from '@/components/common/Card';
import { Phone, TrendingUp, Users, PhoneCall } from 'lucide-react';
import { useLiveDashboardData } from '@/lib/live-data';

export function KPICards() {
  const { data, loading } = useLiveDashboardData();
  const kpis = data.kpis;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        icon={<Phone className="w-6 h-6" />}
        label="Calls Today"
        value={loading ? '—' : kpis.total_calls_today.toLocaleString()}
        subtext="Live calls from Twilio"
        trend={{
          value: Math.abs(kpis.calls_comparison),
          direction: kpis.calls_comparison >= 0 ? 'up' : 'down',
        }}
      />

      <KPICard
        icon={<TrendingUp className="w-6 h-6" />}
        label="Conversions"
        value={loading ? '—' : kpis.total_conversions_today}
        subtext={`${kpis.conversion_rate_today.toFixed(1)}% conversion rate`}
        trend={{
          value: Math.abs(kpis.conversion_comparison),
          direction: kpis.conversion_comparison >= 0 ? 'up' : 'down',
        }}
      />

      <KPICard
        icon={<Users className="w-6 h-6" />}
        label="Active Agents"
        value={loading ? '—' : kpis.active_agents}
        subtext={`${kpis.active_campaigns} active campaign${kpis.active_campaigns === 1 ? '' : 's'}`}
      />

      <KPICard
        icon={<PhoneCall className="w-6 h-6" />}
        label="Total Calls"
        value={loading ? '—' : kpis.total_calls_all_time.toLocaleString()}
        subtext={`Avg call: ${kpis.average_call_duration}s`}
      />
    </div>
  );
}
