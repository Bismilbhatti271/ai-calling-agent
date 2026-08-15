'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/live-data';
import {
  Phone,
  PhoneCall,
  Settings,
  Upload,
  Download,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader,
  RefreshCw,
  ArrowRight,
  Users,
  Play,
  Square,
  Server,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface VICIdialStatus {
  connected: boolean;
  api_url: string;
  campaign_id: string;
  agent_user: string;
  last_check: number;
  active_sessions: number;
  agent_status?: any;
}

interface VICIdialSession {
  call_id: string;
  phone_number: string;
  customer_name: string;
  started_at: number;
  call_ended: boolean;
  call_transferred: boolean;
  age_collected: number | null;
  current_turn: number;
}

export default function VICIdialPage() {
  const [status, setStatus] = useState<VICIdialStatus | null>(null);
  const [sessions, setSessions] = useState<VICIdialSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config form
  const [showConfig, setShowConfig] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configForm, setConfigForm] = useState({
    agent_user: '',
    agent_pass: '',
    campaign_id: '',
    server_url: '',
    api_url: '',
    api_user: '',
    api_pass: '',
    default_queue: '200',
    transfer_mode: 'QUEUE',
  });

  // Lead sync
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Agent status
  const [agentStatus, setAgentStatus] = useState<string>('UNKNOWN');

  const loadData = async () => {
    try {
      const [statusData, sessionsData] = await Promise.all([
        fetch(`${API_BASE}/vicidial/status`, { headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` } }).then(r => r.json()),
        fetch(`${API_BASE}/vicidial/sessions`, { headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` } }).then(r => r.json()),
      ]);
      setStatus(statusData);
      setSessions(sessionsData.sessions || []);
      setError(null);
    } catch (e: any) {
      setError('Failed to load VICIdial status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status?.agent_status) {
      setAgentStatus(
        typeof status.agent_status === 'object'
          ? status.agent_status.status || JSON.stringify(status.agent_status)
          : String(status.agent_status)
      );
    }
  }, [status]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/vicidial/config`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      const data = await res.json();
      setConfigForm({
        agent_user: data.agent_user || '',
        agent_pass: '',
        campaign_id: data.campaign_id || '',
        server_url: data.server_ip || data.server_url || '',
        api_url: data.api_url || '',
        api_user: data.api_user || '',
        api_pass: '',
        default_queue: data.default_queue || '200',
        transfer_mode: data.transfer_mode || 'QUEUE',
      });
    } catch { }
  };

  const handleSaveConfig = async () => {
    try {
      // Map frontend fields to backend keys
      const payload: any = { ...configForm };
      payload.server_ip = payload.server_url;
      delete payload.server_url;

      const res = await fetch(`${API_BASE}/vicidial/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('empirex_token')}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowConfig(false);
        loadData();
      } else {
        alert('Failed to save config');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const testConnection = async () => {
    try {
      const res = await fetch(`${API_BASE}/vicidial/config/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      const data = await res.json();
      alert(
        `API: ${data.api_ok ? 'OK' : 'FAIL'}\nAgent: ${data.agent_ok ? 'OK' : 'FAIL'}\nCampaign: ${data.campaign_ok ? 'OK' : 'FAIL'}`
      );
      loadData();
    } catch (e: any) {
      alert('Test failed: ' + e.message);
    }
  };

  const getAgentLogin = async () => {
    try {
      await fetch(`${API_BASE}/vicidial/agent/login`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      loadData();
    } catch (e: any) {
      alert('Login failed: ' + e.message);
    }
  };

  const getAgentLogout = async () => {
    try {
      await fetch(`${API_BASE}/vicidial/agent/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      loadData();
    } catch (e: any) {
      alert('Logout failed: ' + e.message);
    }
  };

  const startCampaign = async () => {
    try {
      await fetch(`${API_BASE}/vicidial/campaign/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      loadData();
    } catch (e: any) {
      alert('Start failed: ' + e.message);
    }
  };

  const stopCampaign = async () => {
    try {
      await fetch(`${API_BASE}/vicidial/campaign/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      loadData();
    } catch (e: any) {
      alert('Stop failed: ' + e.message);
    }
  };

  const syncLeads = async () => {
    setSyncResult('Syncing...');
    try {
      // Get pending leads from current campaigns
      const campaigns = await api.campaigns.list();
      if (campaigns.length === 0) {
        setSyncResult('No campaigns to sync');
        return;
      }

      const leadResults: string[] = [];
      for (const campaign of campaigns) {
        const leads = await api.leads.list(campaign.id, 'pending');
        if (leads.length === 0) continue;

        const res = await fetch(`${API_BASE}/vicidial/sync-leads-to-vicidial`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('empirex_token')}`,
          },
          body: JSON.stringify({
            campaign_id: configForm.campaign_id || undefined,
            leads: leads.map((l) => ({
              phone_number: l.phone_number,
              first_name: l.first_name,
              last_name: l.last_name,
            })),
          }),
        });
        const data = await res.json();
        leadResults.push(`${campaign.name}: ${data.imported || 0} imported, ${data.failed || 0} failed`);
      }

      setSyncResult(leadResults.join('\n') || 'No leads to sync');
    } catch (e: any) {
      setSyncResult('Sync failed: ' + e.message);
    }
  };

  const showDialplan = async () => {
    try {
      const res = await fetch(`${API_BASE}/vicidial/dialplan-config`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` },
      });
      const data = await res.json();
      // Show in a textarea for easy copy
      alert('Copy this config to your VICIdial server:\n\n' + data.config);
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
  };

  const getStatusColor = (connected: boolean) => {
    return connected ? 'text-green-400' : 'text-red-400';
  };

  const getAgentStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s.includes('READY') || s.includes('AVAILABLE') || s.includes('INCALL')) {
      return <Badge variant="success">{status}</Badge>;
    }
    if (s.includes('PAUSED') || s.includes('IDLE')) {
      return <Badge variant="warning">{status}</Badge>;
    }
    if (s.includes('ERROR') || s.includes('LOGGED OUT') || s.includes('UNKNOWN')) {
      return <Badge variant="error">{status}</Badge>;
    }
    return <Badge variant="default">{status}</Badge>;
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <MainLayout title="VICIdial Integration" breadcrumbs={[{ label: 'VICIdial' }]}>
          <div className="flex items-center justify-center py-20">
            <Loader className="animate-spin text-gray-400" size={32} />
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <MainLayout title="VICIdial Integration" breadcrumbs={[{ label: 'VICIdial' }]}>
        <div className="space-y-6">
          {/* Error banner */}
          {error && (
            <Card className="border-red-500/30 bg-red-500/10">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-red-400" />
                <span className="text-red-300 text-sm">{error}</span>
                <button onClick={loadData} className="ml-auto text-red-400 hover:text-red-300">
                  <RefreshCw size={16} />
                </button>
              </div>
            </Card>
          )}

          {/* Connection Status */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Server size={24} className={getStatusColor(status?.connected || false)} />
                <div>
                  <h3 className="text-lg font-bold text-white">VICIdial Connection</h3>
                  <p className="text-sm text-gray-400">
                    {status?.connected ? 'Connected to VICIdial API' : 'Not connected'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowConfig(!showConfig); if (!showConfig) loadConfig(); }}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth"
                >
                  <Settings size={16} /> Configure
                </button>
                <button
                  onClick={testConnection}
                  className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-400 text-sm transition-all-smooth"
                >
                  <RefreshCw size={16} /> Test
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="p-4 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                <p className={`text-lg font-bold mt-1 ${status?.connected ? 'text-green-400' : 'text-red-400'}`}>
                  {status?.connected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Campaign</p>
                <p className="text-lg font-bold text-white mt-1">{status?.campaign_id || '—'}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Active Sessions</p>
                <p className="text-lg font-bold text-white mt-1">{status?.active_sessions || 0}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Agent Status</p>
                <div className="mt-1">{getAgentStatusBadge(agentStatus)}</div>
              </div>
            </div>
          </Card>

          {/* Configuration Panel */}
          {showConfig && (
            <Card>
              <h3 className="text-lg font-bold text-white mb-4">VICIdial Configuration</h3>
              <p className="text-sm text-gray-400 mb-6">
                Your client gives you an agent username, password, and campaign ID — that's all you need.
              </p>

              {/* Essential Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">
                      Agent Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={configForm.agent_user}
                      onChange={(e) => setConfigForm({ ...configForm, agent_user: e.target.value })}
                      placeholder="e.g. AI_AGENT_01"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">
                      Agent Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={configForm.agent_pass}
                      onChange={(e) => setConfigForm({ ...configForm, agent_pass: e.target.value })}
                      placeholder="Agent password from VICIdial"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">
                      Campaign ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={configForm.campaign_id}
                      onChange={(e) => setConfigForm({ ...configForm, campaign_id: e.target.value })}
                      placeholder="e.g. AI_CAMPAIGN"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">
                      VICIdial Server URL
                    </label>
                    <input
                      type="text"
                      value={configForm.server_url}
                      onChange={(e) => setConfigForm({ ...configForm, server_url: e.target.value })}
                      placeholder="e.g. 192.168.1.100 or your-vicidial.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                    <p className="text-xs text-gray-600 mt-1">IP or domain of your VICIdial server</p>
                  </div>
                </div>
              </div>

              {/* Advanced Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 mt-6 mb-2 transition-colors"
              >
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
              </button>

              {/* Advanced Fields */}
              {showAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">API URL</label>
                    <input
                      type="text"
                      value={configForm.api_url}
                      onChange={(e) => setConfigForm({ ...configForm, api_url: e.target.value })}
                      placeholder="http://YOUR_VICIDIAL_SERVER/vicidial/non_agent_api.php"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                    <p className="text-xs text-gray-600 mt-1">Only needed for lead sync &amp; dispositions</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">API User</label>
                    <input
                      type="text"
                      value={configForm.api_user}
                      onChange={(e) => setConfigForm({ ...configForm, api_user: e.target.value })}
                      placeholder="VICIdial API user"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">API Password</label>
                    <input
                      type="password"
                      value={configForm.api_pass}
                      onChange={(e) => setConfigForm({ ...configForm, api_pass: e.target.value })}
                      placeholder="VICIdial API password"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Default Transfer Queue</label>
                    <input
                      type="text"
                      value={configForm.default_queue}
                      onChange={(e) => setConfigForm({ ...configForm, default_queue: e.target.value })}
                      placeholder="200"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Transfer Mode</label>
                    <select
                      value={configForm.transfer_mode}
                      onChange={(e) => setConfigForm({ ...configForm, transfer_mode: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="QUEUE">Ingroup (Transfer to VICIdial Queue)</option>
                      <option value="EXTEN">DID (Transfer to Phone Number)</option>
                      <option value="AGENT">Direct Agent Transfer</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveConfig}
                  className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-6 py-2.5 text-green-400 font-medium transition-all-smooth"
                >
                  Save Configuration
                </button>
                <button
                  onClick={() => setShowConfig(false)}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-6 py-2.5 text-white font-medium transition-all-smooth"
                >
                  Cancel
                </button>
              </div>
            </Card>
          )}

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Agent Controls */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Users size={20} className="text-blue-400" />
                <h3 className="text-lg font-bold text-white">AI Agent</h3>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                The AI agent must be logged into VICIdial to receive calls.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={getAgentLogin}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-4 py-2.5 text-green-400 text-sm font-medium transition-all-smooth"
                >
                  <CheckCircle size={16} /> Login
                </button>
                <button
                  onClick={getAgentLogout}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm font-medium transition-all-smooth"
                >
                  <XCircle size={16} /> Logout
                </button>
              </div>
            </Card>

            {/* Campaign Controls */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <PhoneCall size={20} className="text-purple-400" />
                <h3 className="text-lg font-bold text-white">Auto Dialer</h3>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Start/stop the VICIdial auto-dialer campaign.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={startCampaign}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-4 py-2.5 text-green-400 text-sm font-medium transition-all-smooth"
                >
                  <Play size={16} /> Start
                </button>
                <button
                  onClick={stopCampaign}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm font-medium transition-all-smooth"
                >
                  <Square size={16} /> Stop
                </button>
              </div>
            </Card>

            {/* Lead Sync */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Upload size={20} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Lead Sync</h3>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Sync pending Empire-X leads to VICIdial for auto-dialing.
              </p>
              <button
                onClick={syncLeads}
                className="w-full flex items-center justify-center gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg px-4 py-2.5 text-yellow-400 text-sm font-medium transition-all-smooth"
              >
                <ArrowRight size={16} /> Sync Leads to VICIdial
              </button>
              {syncResult && (
                <pre className="mt-3 p-3 bg-white/5 rounded-lg text-xs text-gray-400 whitespace-pre-wrap">
                  {syncResult}
                </pre>
              )}
            </Card>
          </div>

          {/* Setup Guide */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-cyan-400" />
                <h3 className="text-lg font-bold text-white">VICIdial Setup Guide</h3>
              </div>
              <button
                onClick={showDialplan}
                className="flex items-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-lg px-4 py-2 text-cyan-400 text-sm transition-all-smooth"
              >
                <Download size={16} /> Get Dialplan Config
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <p className="text-white font-medium">Install the FastAGI server</p>
                  <p className="mt-1">
                    Run <code className="text-cyan-400">python backend/agi_handler.py --mode fastagi --port 4573</code>
                    on your Empire-X server. This bridges VICIdial calls to the AI agent.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <p className="text-white font-medium">Configure VICIdial Server</p>
                  <p className="mt-1">
                    In VICIdial Admin → Servers → Edit your server, set the AGI Server to your
                    Empire-X machine's IP and port 4573.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <p className="text-white font-medium">Add Dialplan Config</p>
                  <p className="mt-1">
                    Click "Get Dialplan Config" above and add the generated config to your
                    VICIdial's <code className="text-cyan-400">extensions_custom.conf</code>.
                    Then reload the dialplan.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">4</span>
                <div>
                  <p className="text-white font-medium">Create AI Agent in VICIdial</p>
                  <p className="mt-1">
                    In VICIdial Admin → Agents, create a new agent (e.g., "AI_AGENT_01").
                    Set the agent to use the Empire-IX campaign. The AI agent logs in automatically
                    when you click "Login" above.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">5</span>
                <div>
                  <p className="text-white font-medium">Upload Leads & Start Dialing</p>
                  <p className="mt-1">
                    Use "Sync Leads to VICIdial" to push Empire-X leads to VICIdial, or
                    upload leads directly in VICIdial's admin. Then start the campaign.
                    VICIdial dials → AGI bridges to AI → AI transfers qualified leads to humans.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Active Sessions */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Phone size={20} className="text-green-400" />
                <h3 className="text-lg font-bold text-white">Active Sessions ({sessions.length})</h3>
              </div>
              <button onClick={loadData} className="text-gray-400 hover:text-white transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>

            {sessions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No active VICIdial sessions. When VICIdial routes a call, it will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-3 px-2">Call ID</th>
                      <th className="text-left py-3 px-2">Customer</th>
                      <th className="text-left py-3 px-2">Phone</th>
                      <th className="text-left py-3 px-2">Duration</th>
                      <th className="text-left py-3 px-2">Turns</th>
                      <th className="text-left py-3 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.call_id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-2 font-mono text-xs text-gray-300">{session.call_id}</td>
                        <td className="py-3 px-2 text-white">{session.customer_name}</td>
                        <td className="py-3 px-2 font-mono text-gray-300">{session.phone_number}</td>
                        <td className="py-3 px-2 text-gray-300">
                          {session.started_at
                            ? Math.floor((Date.now() / 1000 - session.started_at) / 60) + 'm'
                            : '—'}
                        </td>
                        <td className="py-3 px-2 text-gray-300">{session.current_turn || 0}</td>
                        <td className="py-3 px-2">
                          {session.call_ended ? (
                            <Badge variant={session.call_transferred ? 'success' : 'error'}>
                              {session.call_transferred ? 'Transferred' : 'Ended'}
                            </Badge>
                          ) : (
                            <Badge variant="warning">
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                                Active
                              </span>
                            </Badge>
                          )}
                        </td>
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
