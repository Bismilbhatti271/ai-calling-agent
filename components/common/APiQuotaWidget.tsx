'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function APiQuotaWidget() {
  const [data, setData] = useState<{ total_calls: number; quota: number; usage_percentage: number } | null>(null);

  useEffect(() => {
    api.usage.get(30).then((res) => setData(res.summary)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="glass rounded-lg p-3 text-xs text-gray-400 space-y-2">
        <div className="flex justify-between">
          <span>API Quota</span>
          <span className="text-gray-500">Loading...</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-gray-400 to-gray-300" style={{ width: '0%' }} />
        </div>
      </div>
    );
  }

  const pct = Math.min(data.usage_percentage, 100);

  return (
    <div className="glass rounded-lg p-3 text-xs text-gray-400 space-y-2">
      <div className="flex justify-between">
        <span>API Quota</span>
        <span className="text-white">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-gray-400 to-gray-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="pt-1 text-gray-500">
        {data.total_calls.toLocaleString()} / {data.quota.toLocaleString()} calls
      </p>
    </div>
  );
}