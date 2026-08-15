'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { useAuth } from '@/lib/auth-context';
import { api, Agent, CallRecord } from '@/lib/api';
import { ArrowLeft, Save, X, RefreshCw, Volume2, Loader } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function AgentDetailPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const params = useParams();
  const router = useRouter();
  const agentId = Number(params.id);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', model: '', voice_type: '', status: '' });
  const [voices, setVoices] = useState<{name: string; friendly_name: string; gender: string}[]>([]);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_LIVE_API_BASE || 'http://localhost:8000'}/voices`)
      .then(r => r.json())
      .then(data => { if (data.voices) setVoices(data.voices); })
      .catch(() => {});
  }, []);

  async function loadData() {
    try {
      const [agentData, callsData] = await Promise.all([
        api.agents.get(agentId),
        api.calls.list(),
      ]);
      setAgent(agentData);
      setForm({
        name: agentData.name,
        description: agentData.description,
        model: agentData.model,
        voice_type: agentData.voice_type,
        status: agentData.status,
      });
      setCalls(Array.isArray(callsData) ? callsData.filter((c) => c.agent_id === agentId) : []);
    } catch {
      setAgent(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadData(); }, [agentId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.agents.update(agentId, form);
      setAgent((prev) => prev ? { ...prev, ...form } : null);
      setEditing(false);
    } catch (e) {
      console.error('Failed to update agent', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
      <MainLayout title="Loading..." breadcrumbs={[{ label: 'Agents' }]}>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Loading agent...</p>
        </div>
      </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!agent) {
    return (
      <ProtectedRoute>
      <MainLayout title="Agent Not Found" breadcrumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Not Found' }]}>
        <Card>
          <p className="text-gray-400">Agent not found. It may have been deleted.</p>
          <Link href="/agents" className="text-white underline mt-2 inline-block">Back to agents</Link>
        </Card>
      </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
    <MainLayout
      title={agent.name}
      breadcrumbs={[
        { label: 'Agents', href: '/agents' },
        { label: agent.name },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/agents" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            Back to Agents
          </Link>
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth disabled:opacity-40">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <Card>
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Agent Name</label>
                    <input
                      type="text" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30 min-h-[80px]"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
                      <input
                        type="text" value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
                      <div className="flex gap-2">
                        <select value={form.voice_type}
                          onChange={(e) => setForm({ ...form, voice_type: e.target.value })}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
                        >
                          {voices.length === 0 ? (
                            <>
                              <option value="en-US-GuyNeural">Guy (Default)</option>
                              <option value="en-US-JennyNeural">Jenny</option>
                              <option value="en-US-AriaNeural">Aria</option>
                              <option value="en-US-DavisNeural">Davis</option>
                              <option value="en-US-JaneNeural">Jane</option>
                              <option value="en-US-JasonNeural">Jason</option>
                              <option value="en-US-NancyNeural">Nancy</option>
                              <option value="en-US-SaraNeural">Sara</option>
                              <option value="en-US-TonyNeural">Tony</option>
                              <option value="en-US-AmberNeural">Amber</option>
                              <option value="en-US-AnaNeural">Ana</option>
                              <option value="en-US-AshleyNeural">Ashley</option>
                              <option value="en-US-BrandonNeural">Brandon</option>
                              <option value="en-US-ChristopherNeural">Christopher</option>
                              <option value="en-US-CoraNeural">Cora</option>
                              <option value="en-US-ElizabethNeural">Elizabeth</option>
                              <option value="en-US-EricNeural">Eric</option>
                              <option value="en-US-JacobNeural">Jacob</option>
                              <option value="en-US-MichelleNeural">Michelle</option>
                              <option value="en-US-MonicaNeural">Monica</option>
                              <option value="en-US-RogerNeural">Roger</option>
                              <option value="en-US-SteffanNeural">Steffan</option>
                              <option value="en-US-ThomasNeural">Thomas</option>
                            </>
                          ) : (
                            voices.map((v) => (
                              <option key={v.name} value={v.name}>{v.friendly_name} ({v.gender})</option>
                            ))
                          )}
                        </select>
                        <button type="button" onClick={async () => {
                          if (!form.voice_type) return;
                          setPreviewing(true);
                          try {
                            const resp = await fetch(`${process.env.NEXT_PUBLIC_LIVE_API_BASE || 'http://localhost:8000'}/tts`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ text: `Hi there, this is ${form.name || 'your agent'}. How are you doing today?`, voice: form.voice_type }),
                            });
                            if (resp.ok) {
                              const blob = await resp.blob();
                              const url = URL.createObjectURL(blob);
                              const audio = new Audio(url);
                              audio.onended = () => URL.revokeObjectURL(url);
                              audio.play();
                            }
                          } catch {}
                          setPreviewing(false);
                        }} disabled={previewing}
                          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm transition-all-smooth disabled:opacity-40"
                          title="Preview voice">
                          {previewing ? <Loader size={16} className="animate-spin" /> : <Volume2 size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setEditing(false); setForm({ name: agent.name, description: agent.description, model: agent.model, voice_type: agent.voice_type, status: agent.status }); }}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white transition-colors"
                    >
                      <X size={16} /> Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                    >
                      <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{agent.name}</h2>
                      <p className="text-gray-400 mt-2">{agent.description}</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => setEditing(true)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white text-sm transition-colors"
                      >
                        Edit Agent
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-6 mt-6 border-t border-white/10">
                    <div>
                      <p className="text-gray-400 text-sm">Model</p>
                      <p className="text-white font-mono mt-1">{agent.model}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Voice Type</p>
                      <p className="text-white mt-1">{agent.voice_type}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Status</p>
                      <p className="mt-1">
                        <Badge variant={agent.status === 'active' ? 'success' : 'default'}>
                          {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Total Calls</p>
                      <p className="text-white font-semibold mt-1">{(agent.real_total_calls ?? agent.total_calls ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Today</p>
                      <p className="text-white mt-1">{(agent.real_calls_today ?? agent.calls_today ?? 0)} calls</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Conversions</p>
                      <p className="text-white font-semibold mt-1">{(agent.real_conversions ?? 0)} ({(agent.real_conversion_rate ?? agent.conversion_rate ?? 0).toFixed(1)}%)</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-white">Recent Calls</h3>
            <p className="text-sm text-gray-400 mt-1">{calls.length} calls</p>
          </div>
          {calls.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No calls yet for this agent.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-left">
                    <th className="pb-3 pr-4">Phone</th>
                    <th className="pb-3 pr-4">Customer</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Result</th>
                    <th className="pb-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.slice(0, 20).map((call) => (
                    <tr key={call.id} className="border-b border-white/5 text-white">
                      <td className="py-3 pr-4 font-mono">{call.phone_number}</td>
                      <td className="py-3 pr-4">{call.customer_name || '-'}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={call.status === 'completed' ? 'success' : 'error'}>
                          {call.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={call.result === 'conversion' ? 'success' : call.result === 'declined' ? 'error' : 'warning'}>
                          {call.result?.replace(/_/g, ' ').toUpperCase() || '-'}
                        </Badge>
                      </td>
                      <td className="py-3">{new Date(call.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
    </ProtectedRoute>
  );
}