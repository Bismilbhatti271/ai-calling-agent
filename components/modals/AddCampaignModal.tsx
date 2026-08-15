'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { api, Agent } from '@/lib/api';

interface AddCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (campaignData: any) => void;
}

export function AddCampaignModal({ isOpen, onClose, onSubmit }: AddCampaignModalProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    agent_id: 0,
    target_count: 100,
    status: 'draft' as const,
  });

  useEffect(() => {
    if (!isOpen) return;
    api.agents.list().then((list) => {
      setAgents(list);
      // Always default to the first available agent
      setFormData(prev => ({ ...prev, agent_id: list[0]?.id || 0 }));
    });
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.description.trim()) {
      alert('Please fill in both name and description.');
      return;
    }
    if (!formData.agent_id || formData.agent_id <= 0) {
      alert('No AI agents available. Please create an agent first.');
      return;
    }
    try {
      await onSubmit(formData);
      setFormData({
        name: '',
        description: '',
        agent_id: agents[0]?.id || 1,
        target_count: 100,
        status: 'draft',
      });
      onClose();
    } catch (err: any) {
      alert('Failed to create campaign: ' + (err.message || 'Unknown error'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Create New Campaign</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Campaign Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Q3 Sales Push"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the campaign goals..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 min-h-[100px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              AI Agent
            </label>
            <select
              value={formData.agent_id}
              onChange={(e) => setFormData({ ...formData, agent_id: parseInt(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Target Contacts
            </label>
            <input
              type="number"
              value={formData.target_count}
              onChange={(e) => setFormData({ ...formData, target_count: parseInt(e.target.value) })}
              min="1"
              max="10000"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Initial Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-white/20 hover:bg-white/30 border border-white/30 rounded-lg text-white font-medium transition-colors"
            >
              Create Campaign
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
