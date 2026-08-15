'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { AddCampaignModal } from '@/components/modals/AddCampaignModal';
import { api, Campaign } from '@/lib/api';
import { Plus, Search, Trash2, RotateCw, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function CampaignsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCampaigns = useCallback(async (isManualRefresh = false) => {
    try {
      const data = await api.campaigns.list();
      setCampaigns(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(() => fetchCampaigns(), 5000);
    return () => clearInterval(interval);
  }, [fetchCampaigns]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCampaigns(true);
  };

  const handleCreateCampaign = async (campaignData: any) => {
    await api.campaigns.create({
      name: campaignData.name,
      description: campaignData.description,
      agent_id: parseInt(campaignData.agent_id),
      target_count: campaignData.target_count || 0,
      daily_target: campaignData.daily_target || 0,
    });
    await fetchCampaigns();
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete campaign "${name}" and all its leads/calls?`)) return;
    setDeletingId(id);
    try {
      await api.campaigns.delete(id);
      await fetchCampaigns();
    } finally {
      setDeletingId(null);
    }
  };

  let filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description.toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (filterStatus) {
    filteredCampaigns = filteredCampaigns.filter((c) => c.status === filterStatus);
  }

  return (
    <ProtectedRoute>
      <MainLayout title="Campaigns" breadcrumbs={[{ label: 'Campaigns' }]}>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text" placeholder="Search campaigns..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-all-smooth"
                />
              </div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2.5 text-white text-sm transition-all-smooth disabled:opacity-40">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 rounded-lg px-4 py-2.5 text-white font-medium transition-all-smooth">
              <Plus size={18} /> Create Campaign
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[null, 'active', 'paused', 'completed', 'draft'].map((status) => (
              <button key={status || 'all'} onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-all-smooth ${
                  filterStatus === status
                    ? 'bg-white/20 text-white border border-white/30'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
                }`}>
                {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCampaigns.map((campaign) => {
              const pct = campaign.target_count > 0 ? (campaign.completed_count / campaign.target_count) * 100 : 0;
              const convPct = campaign.completed_count > 0 ? (campaign.conversion_count / campaign.completed_count) * 100 : 0;
              return (
                <div key={campaign.id} className="group relative">
                  <Link href={`/campaigns/${campaign.id}`}>
                    <Card className="hover:border-white/30 hover:bg-white/8 cursor-pointer h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white group-hover:text-gray-200 transition-colors">{campaign.name}</h3>
                          <p className="text-sm text-gray-400 mt-1">{campaign.description}</p>
                        </div>
                        <Badge variant={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : campaign.status === 'draft' ? 'info' : 'default'}>
                          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="space-y-4 pt-4 border-t border-white/10">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Agent</span>
                          <span className="text-white">{campaign.agent_name || 'Unknown'}</span>
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-gray-400 text-sm">Progress</span>
                            <span className="text-white text-sm font-semibold">{campaign.completed_count.toLocaleString()} / {campaign.target_count.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-gray-400 to-gray-300 transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <div className="bg-white/5 rounded p-2">
                            <p className="text-gray-400 text-xs">Conversions</p>
                            <p className="text-white font-bold">{campaign.conversion_count}</p>
                          </div>
                          <div className="bg-white/5 rounded p-2">
                            <p className="text-gray-400 text-xs">Conv. Rate</p>
                            <p className="text-white font-bold">{isNaN(convPct) ? '0' : convPct.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                  <button onClick={(e) => { e.preventDefault(); handleDelete(campaign.id, campaign.name); }}
                    disabled={deletingId === campaign.id}
                    className="absolute top-3 right-3 w-8 h-8 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all-smooth"
                    title="Delete campaign">
                    {deletingId === campaign.id ? <RotateCw size={14} className="text-red-400 animate-spin" /> : <Trash2 size={14} className="text-red-400" />}
                  </button>
                </div>
              );
            })}
          </div>

          {loading && <Card className="text-center py-12"><p className="text-gray-400">Loading campaigns...</p></Card>}
          {!loading && filteredCampaigns.length === 0 && (
            <Card className="text-center py-12"><p className="text-gray-400">No campaigns found</p></Card>
          )}
        </div>

        <AddCampaignModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreateCampaign} />
      </MainLayout>
    </ProtectedRoute>
  );
}
