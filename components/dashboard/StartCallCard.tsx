'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/common/Card';
import { API_BASE } from '@/lib/live-data';
import { api, Agent } from '@/lib/api';

type CallState = 'idle' | 'calling' | 'success' | 'error';

export function StartCallCard() {
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number>(1);
  const [selectedCampaign, setSelectedCampaign] = useState<number>(1);
  const [state, setState] = useState<CallState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.agents.list().then(setAgents);
  }, []);

  async function handleCall() {
    if (!phone.trim()) return;
    setState('calling');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/calling/start-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone.trim(),
          customer_name: customerName.trim() || 'there',
          agent_id: selectedAgent,
          campaign_id: selectedCampaign,
        }),
      });
      const data = await res.json();
      if (res.ok && data.call_id) {
        setState('success');
        setMessage(`Call #${data.call_id} started. Watch below for live updates.`);
      } else {
        setState('error');
        setMessage(data.detail || 'Call failed to start.');
      }
    } catch (e: any) {
      setState('error');
      setMessage(e.message || 'Network error reaching the calling backend.');
    }
  }

  return (
    <Card>
      <p className="text-gray-400 text-sm font-medium mb-3">Start a Call</p>
      <div className="space-y-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number (e.g. +1234567890)"
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer name (optional)"
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(parseInt(e.target.value))}
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            onClick={handleCall}
            disabled={state === 'calling' || !phone.trim()}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all-smooth"
          >
            {state === 'calling' ? 'Calling…' : 'Call Now'}
          </button>
        </div>
      </div>
      {message && (
        <p className={`text-xs mt-3 ${state === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}
    </Card>
  );
}
