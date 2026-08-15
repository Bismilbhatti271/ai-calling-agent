'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { AddAgentModal } from '@/components/modals/AddAgentModal';
import { useAuth } from '@/lib/auth-context';
import { api, Agent } from '@/lib/api';
import { Plus, Search, Trash2, RotateCw, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function AgentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAgents = useCallback(async (isManualRefresh = false) => {
    try {
      const data = await api.agents.list();
      setAgents(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(() => fetchAgents(), 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAgents(true);
  };

  const handleCreate = async (agentData: any) => {
    await api.agents.create({
      name: agentData.name,
      description: agentData.description,
      model: agentData.model,
      voice_type: agentData.voice_type,
    });
    await fetchAgents();
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.agents.delete(id);
      await fetchAgents();
    } finally {
      setDeletingId(null);
    }
  };

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <MainLayout title="AI Agents" breadcrumbs={[{ label: 'Agents' }]}>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text" placeholder="Search agents..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-all-smooth"
                />
              </div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2.5 text-white text-sm transition-all-smooth disabled:opacity-40">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 rounded-lg px-4 py-2.5 text-white font-medium transition-all-smooth"
              >
                <Plus size={18} /> Create Agent
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAgents.map((agent) => (
              <div key={agent.id} className="group relative">
                <Link href={`/agents/${agent.id}`}>
                  <Card className="hover:border-white/30 hover:bg-white/8 cursor-pointer">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-white group-hover:text-gray-200 transition-colors">{agent.name}</h3>
                        <p className="text-sm text-gray-400 mt-1">{agent.description}</p>
                      </div>
                      <Badge variant={agent.status === 'active' ? 'success' : 'default'}>
                        {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-white/10">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Model</span>
                        <span className="text-white font-mono text-xs">{agent.model}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Voice</span>
                        <span className="text-white">{agent.voice_type}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Total Calls</span>
                        <span className="text-white font-semibold">{(agent.real_total_calls ?? agent.total_calls).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Today</span>
                        <span className="text-gray-300">{(agent.real_calls_today ?? agent.calls_today)} calls</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Conversions</span>
                        <span className="text-white font-semibold">{(agent.real_conversions ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Conversion Rate</span>
                        <span className="text-green-400 font-semibold">{(agent.real_conversion_rate ?? agent.conversion_rate).toFixed(1)}%</span>
                      </div>
                    </div>
                  </Card>
                </Link>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(agent.id, agent.name); }}
                    disabled={deletingId === agent.id}
                    className="absolute top-3 right-3 w-8 h-8 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all-smooth"
                    title="Delete agent"
                  >
                    {deletingId === agent.id ? (
                      <RotateCw size={14} className="text-red-400 animate-spin" />
                    ) : (
                      <Trash2 size={14} className="text-red-400" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {!loading && filteredAgents.length === 0 && (
            <Card className="text-center py-12">
              <p className="text-gray-400">No agents found</p>
            </Card>
          )}
        </div>

        <AddAgentModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
