'use client';

import { useEffect, useState, useCallback } from 'react';

export const LIVE_API_BASE =
  process.env.NEXT_PUBLIC_LIVE_API_BASE || 'http://localhost:8002';

export const API_BASE = `${LIVE_API_BASE}/api`;

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('empirex_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface LiveKPIs {
  total_calls_today: number;
  calls_comparison: number;
  total_conversions_today: number;
  conversion_rate_today: number;
  conversion_comparison: number;
  active_agents: number;
  active_campaigns: number;
  total_revenue: number;
  average_call_duration: number;
  total_calls_all_time: number;
}

export interface LiveCall {
  id: string;
  customer_name: string;
  phone_number: string;
  agent_name: string;
  status: 'completed' | 'in_progress';
  result: 'conversion' | 'declined' | 'transferred' | 'in_progress';
  age_collected: number | null;
  duration_seconds: number;
  created_at: string;
}

export interface LiveAgent {
  name: string;
  total_calls: number;
  calls_today: number;
  conversion_rate: number;
  status: 'active' | 'inactive';
}

export interface LiveCallsByDay {
  date: string;
  count: number;
  conversions: number;
  conversion_rate: number;
}

export interface LiveDashboardData {
  kpis: LiveKPIs;
  recent_calls: LiveCall[];
  calls_by_day: LiveCallsByDay[];
  agents: LiveAgent[];
}

const EMPTY_DATA: LiveDashboardData = {
  kpis: {
    total_calls_today: 0,
    calls_comparison: 0,
    total_conversions_today: 0,
    conversion_rate_today: 0,
    conversion_comparison: 0,
    active_agents: 0,
    active_campaigns: 0,
    total_revenue: 0,
    average_call_duration: 0,
    total_calls_all_time: 0,
  },
  recent_calls: [],
  calls_by_day: [],
  agents: [],
};

async function fetchDashboardData(): Promise<LiveDashboardData> {
  const headers = getAuthHeaders();
  const [kpisRes, callsByDayRes, recentCallsRes, agentsRes] = await Promise.allSettled([
    fetch(`${API_BASE}/dashboard/kpis`, { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(`${API_BASE}/dashboard/calls-by-day?days=7`, { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(`${API_BASE}/calls/recent?limit=10`, { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(`${API_BASE}/agents`, { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
  ]);

  const kpis = kpisRes.status === 'fulfilled' ? kpisRes.value : EMPTY_DATA.kpis;

  const calls_by_day = callsByDayRes.status === 'fulfilled' ? callsByDayRes.value : [];

  const recent_calls = recentCallsRes.status === 'fulfilled'
    ? recentCallsRes.value.map((c: any) => ({
        id: c.id.toString(),
        customer_name: c.customer_name || '',
        phone_number: c.phone_number,
        agent_name: c.agent_name || 'Unknown',
        status: c.status,
        result: c.result,
        age_collected: c.age_collected,
        duration_seconds: c.duration_seconds,
        created_at: c.created_at,
      }))
    : [];

  const agents = agentsRes.status === 'fulfilled'
    ? agentsRes.value.map((a: any) => ({
        name: a.name,
        total_calls: a.total_calls,
        calls_today: a.calls_today,
        conversion_rate: a.conversion_rate,
        status: a.status,
      }))
    : [];

  return { kpis, calls_by_day, recent_calls, agents };
}

export function useLiveDashboardData(pollMs = 5000) {
  const [data, setData] = useState<LiveDashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const json = await fetchDashboardData();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load live data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await fetchData();
      if (cancelled) return;
      const interval = setInterval(async () => {
        if (cancelled) return;
        await fetchData();
      }, pollMs);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    run();
  }, [fetchData, pollMs]);

  return { data, loading, error, refresh: fetchData };
}
