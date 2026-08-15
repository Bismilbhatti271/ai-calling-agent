'use client';

import { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, KPICard } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Table } from '@/components/common/Table';
import { api, Campaign, CallRecord, Lead, Agent } from '@/lib/api';
import { API_BASE } from '@/lib/live-data';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { ArrowLeft, Plus, Upload, PhoneCall, Send, Loader, MessageSquareText, X, Trash2, Save, FileText, Cpu, RefreshCw, Play, Pause, StopCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ChatMsg { role: 'agent' | 'customer'; text: string }

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = parseInt(params.id as string);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignCalls, setCampaignCalls] = useState<CallRecord[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Script & Model
  const [scriptText, setScriptText] = useState('');
  const [scriptSaving, setScriptSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelSaving, setModelSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [agentSaving, setAgentSaving] = useState(false);

  // Rebuttals
  const defaultRebuttals: Record<string, string> = {
    "not_interested": "I completely understand — all I need is your age to check if this is even available in your area, no obligation at all. How old are you?",
    "already_have_insurance": "That's great — final expense is specifically for funeral and burial costs which regular life insurance often doesn't fully cover. May I ask how old you are?",
    "cost": "It depends on age and coverage amount — the specialist gives the exact number. May I ask how old you are?",
    "scam": "This is a licensed insurance campaign — no payment is taken on this call and you're not obligated to anything. May I ask how old you are?",
    "callback": "Of course — may I grab your callback number? And may I ask how old you are so I can note your eligibility?",
    "spouse": "Totally makes sense. May I ask how old you are so I have that noted when we follow up?",
    "fixed_income": "I understand — these plans are actually designed with affordable monthly options specifically for that. May I ask how old you are?",
    "dnc": "Understood — I'll remove you from our list right away. Have a great day!",
  };
  const [rebuttals, setRebuttals] = useState<Record<string, string>>({...defaultRebuttals});
  const [rebuttalsSaving, setRebuttalsSaving] = useState(false);

  // Leads
  const [showAddLead, setShowAddLead] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [dialing, setDialing] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [chatCallId, setChatCallId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [chatCustomerName, setChatCustomerName] = useState('');
  const [chatLeadId, setChatLeadId] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [transcriptCall, setTranscriptCall] = useState<{ id: number; transcript: string; customer_name: string } | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);

  const handleStartCampaign = async () => {
    setStatusChanging(true);
    try { await api.campaigns.start(campaignId); loadAll(); } catch { alert('Failed to start campaign'); }
    finally { setStatusChanging(false); }
  };

  const handlePauseCampaign = async () => {
    setStatusChanging(true);
    try { await api.campaigns.pause(campaignId); loadAll(); } catch { alert('Failed to pause campaign'); }
    finally { setStatusChanging(false); }
  };

  const handleCompleteCampaign = async () => {
    if (!window.confirm('Mark this campaign as completed?')) return;
    setStatusChanging(true);
    try { await api.campaigns.complete(campaignId); loadAll(); } catch { alert('Failed to complete campaign'); }
    finally { setStatusChanging(false); }
  };

  const loadAll = () => {
    Promise.all([
      api.campaigns.get(campaignId),
      api.calls.list(campaignId),
      api.leads.list(campaignId),
      api.agents.list(),
    ]).then(([camp, calls, leadList, ag]) => {
      setCampaign(camp);
      setCampaignCalls(calls);
      setLeads(leadList);
      setAgents(ag);
      setScriptText((camp as any).script || '');
      setSelectedModel((camp as any).model || '');
      setSelectedAgentId((camp as any).agent_id || null);
      // Load rebuttals
      try {
        const saved = JSON.parse((camp as any).rebuttals || '{}');
        setRebuttals({...defaultRebuttals, ...saved});
      } catch {
        setRebuttals({...defaultRebuttals});
      }
    }).finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { loadAll(); }, [campaignId]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAll();
  };
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const handleSaveScript = async () => {
    setScriptSaving(true);
    try {
      await api.campaigns.update(campaignId, { script: scriptText } as any);
      setSaveMsg('Script saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed to save script'); } finally { setScriptSaving(false); }
  };

  const handleSaveModel = async () => {
    setModelSaving(true);
    try {
      await api.campaigns.update(campaignId, { model: selectedModel } as any);
      setSaveMsg('Model updated');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed to update model'); } finally { setModelSaving(false); }
  };

  const handleSaveAgent = async () => {
    if (!selectedAgentId) return;
    setAgentSaving(true);
    try {
      await api.campaigns.update(campaignId, { agent_id: selectedAgentId } as any);
      setSaveMsg('Agent updated');
      setTimeout(() => setSaveMsg(''), 2000);
      loadAll();
    } catch { setSaveMsg('Failed to update agent'); } finally { setAgentSaving(false); }
  };

  const handleSaveRebuttals = async () => {
    setRebuttalsSaving(true);
    try {
      await api.campaigns.update(campaignId, { rebuttals: JSON.stringify(rebuttals) } as any);
      setSaveMsg('Rebuttals saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed to save rebuttals'); } finally { setRebuttalsSaving(false); }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;
    await api.leads.create({ campaign_id: campaignId, phone_number: newPhone.trim(), first_name: newFirstName.trim(), last_name: newLastName.trim() });
    setNewPhone(''); setNewFirstName(''); setNewLastName('');
    setShowAddLead(false); loadAll();
  };

  const handleDeleteLead = async (leadId: number) => {
    if (!window.confirm('Delete this lead?')) return;
    setDeletingLeadId(leadId);
    try { await api.leads.delete(leadId); loadAll(); } finally { setDeletingLeadId(null); }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCsv(true);
    try {
      const form = new FormData();
      form.append('campaign_id', campaignId.toString());
      form.append('file', file);
      await fetch(`${API_BASE}/leads/upload-csv`, { method: 'POST', body: form });
      loadAll();
    } catch (e: any) { alert('CSV upload failed: ' + e.message); } finally { setUploadingCsv(false); }
  };

  const [stoppingCall, setStoppingCall] = useState(false);

  const handleCallLead = async (lead: Lead) => {
    if (!campaign) return;
    setChatMessages([]); setChatEnded(false);
    setChatCustomerName(lead.first_name || 'there');
    setChatOpen(true);
    try {
      const result = await api.calling.startChat({
        campaign_id: campaignId, agent_id: campaign.agent_id,
        phone_number: lead.phone_number, customer_name: lead.first_name || 'there',
        lead_id: lead.id,
      });
      setChatSessionId(result.session_id); setChatCallId(result.call_id);
      setChatLeadId(lead.id);
      setChatMessages([{ role: 'agent', text: result.pitch }]);
      loadAll();
    } catch (e: any) { setChatMessages([{ role: 'agent', text: 'Error: ' + e.message }]); }
  };

  const handleStopCall = async () => {
    if (!window.confirm('Stop this call?')) return;
    setStoppingCall(true);
    try {
      await api.calling.stopCall({
        session_id: chatSessionId ?? undefined,
        call_id: chatCallId ?? undefined,
        lead_id: chatLeadId ?? undefined,
        campaign_id: campaignId,
      });
      setChatEnded(true);
      setChatMessages((prev) => [...prev, { role: 'agent', text: 'Call ended.' }]);
      loadAll();
    } catch (e: any) {
      setChatMessages((prev) => [...prev, { role: 'agent', text: 'Error stopping call: ' + e.message }]);
    } finally {
      setStoppingCall(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatSending || chatEnded || !chatSessionId || !campaign) return;
    const msg = chatInput.trim();
    setChatInput(''); setChatMessages((prev) => [...prev, { role: 'customer', text: msg }]);
    setChatSending(true);
    try {
      const result = await api.calling.sendMessage({
        session_id: chatSessionId, message: msg, campaign_id: campaignId,
        agent_id: campaign.agent_id, customer_name: chatCustomerName,
        call_id: chatCallId ?? undefined,
      });
      setChatMessages((prev) => [...prev, { role: 'agent', text: result.reply }]);
      if (result.call_ended) { setChatEnded(true); loadAll(); }
    } catch (e: any) { setChatMessages((prev) => [...prev, { role: 'agent', text: 'Error: ' + e.message }]); }
    finally { setChatSending(false); }
  };

  const handleViewTranscript = async (lead: Lead) => {
    try {
      const calls = await api.calls.list(campaignId);
      const call = calls.find((c) => c.phone_number === lead.phone_number);
      if (call) {
        const detail = (call as any).transcript ? call : await api.calls.get(call.id);
        setTranscriptCall({ id: detail.id, transcript: (detail as any).transcript || 'No transcript', customer_name: lead.first_name || 'Customer' });
      }
    } catch { setTranscriptCall({ id: 0, transcript: 'Could not load transcript', customer_name: 'Customer' }); }
  };

  const handleStartDialer = async () => {
    setDialing(true);
    try { await api.leads.dial(campaignId); loadAll(); } finally { setDialing(false); }
  };

  if (loading) return <ProtectedRoute><MainLayout title="Loading..." breadcrumbs={[{ label: 'Campaigns' }]}><Card><p className="text-gray-400">Loading...</p></Card></MainLayout></ProtectedRoute>;
  if (!campaign) return <ProtectedRoute><MainLayout title="Not Found" breadcrumbs={[{ label: 'Campaigns' }]}><Card><p className="text-gray-400">Campaign not found</p></Card></MainLayout></ProtectedRoute>;

  const progressPercent = campaign.target_count > 0 ? (campaign.completed_count / campaign.target_count) * 100 : 0;
  const conversionPercent = campaign.completed_count > 0 ? (campaign.conversion_count / campaign.completed_count) * 100 : 0;
  const agentModels = [...new Set(agents.map(a => a.model))];
  const campaignAgent = agents.find(a => a.id === campaign.agent_id);

  const resultData = [
    { name: 'Conversions', value: campaign.conversion_count, color: '#b8b5b0' },
    { name: 'No Conversion', value: campaign.completed_count - campaign.conversion_count, color: '#3a3a3a' },
  ];

  const callColumns = [
    { key: 'phone_number', label: 'Phone', render: (v: string) => <span className="font-mono text-sm">{v}</span> },
    { key: 'status', label: 'Status', render: (v: string) => <Badge variant={v === 'completed' ? 'success' : 'error'}>{v.charAt(0).toUpperCase() + v.slice(1)}</Badge> },
    { key: 'result', label: 'Result', render: (v: string) => <Badge variant={v === 'conversion' ? 'success' : v === 'declined' ? 'error' : 'warning'}>{v?.replace(/_/g, ' ').toUpperCase() || '-'}</Badge> },
  ];

  const getStatusBadge = (status: string) => {
    const m: Record<string, 'success' | 'warning' | 'error' | 'default'> = { pending: 'warning', calling: 'warning', called: 'success', failed: 'success', conversion: 'success', transferred: 'success', declined: 'error' };
    const labels: Record<string, string> = { pending: 'PENDING', calling: 'ON THE WAY', called: 'SUCCESS', failed: 'SUCCESS', conversion: 'SUCCESS', transferred: 'SUCCESS - TRANSFERRED', declined: 'DECLINED' };
    return <Badge variant={m[status] || 'default'}>{labels[status] || status.toUpperCase()}</Badge>;
  };

  return (
    <ProtectedRoute>
    <MainLayout title={campaign.name} breadcrumbs={[{ label: 'Campaigns', href: '/campaigns' }, { label: campaign.name }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/campaigns" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} /> Back to Campaigns
          </Link>
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth disabled:opacity-40">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Campaign Info */}
        <Card>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{campaign.name}</h2>
              <p className="text-gray-400 mt-2">{campaign.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : campaign.status === 'completed' ? 'default' : 'info'} className="text-base px-3 py-1.5">
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </Badge>
              {campaign.status === 'draft' && (
                <button onClick={handleStartCampaign} disabled={statusChanging}
                  className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-4 py-1.5 text-green-400 text-sm font-medium transition-all-smooth disabled:opacity-40">
                  {statusChanging ? <Loader size={14} className="animate-spin" /> : <Play size={14} />} Start
                </button>
              )}
              {campaign.status === 'paused' && (
                <>
                  <button onClick={handleStartCampaign} disabled={statusChanging}
                    className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-4 py-1.5 text-green-400 text-sm font-medium transition-all-smooth disabled:opacity-40">
                    {statusChanging ? <Loader size={14} className="animate-spin" /> : <Play size={14} />} Resume
                  </button>
                  <button onClick={handleCompleteCampaign} disabled={statusChanging}
                    className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-1.5 text-blue-400 text-sm font-medium transition-all-smooth disabled:opacity-40">
                    {statusChanging ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />} Complete
                  </button>
                </>
              )}
              {campaign.status === 'active' && (
                <>
                  <button onClick={handlePauseCampaign} disabled={statusChanging}
                    className="flex items-center gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg px-4 py-1.5 text-yellow-400 text-sm font-medium transition-all-smooth disabled:opacity-40">
                    {statusChanging ? <Loader size={14} className="animate-spin" /> : <Pause size={14} />} Pause
                  </button>
                  <button onClick={handleCompleteCampaign} disabled={statusChanging}
                    className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-1.5 text-blue-400 text-sm font-medium transition-all-smooth disabled:opacity-40">
                    {statusChanging ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />} Complete
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-white/10">
            <div>
              <p className="text-gray-400 text-sm">Agent</p>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={selectedAgentId ?? ''}
                  onChange={(e) => setSelectedAgentId(parseInt(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-white/30"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button onClick={handleSaveAgent} disabled={agentSaving || !selectedAgentId}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-2 py-1 text-white text-xs transition-all-smooth disabled:opacity-40">
                  {agentSaving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                </button>
              </div>
            </div>
            <div><p className="text-gray-400 text-sm">LLM Model</p><p className="text-white mt-1 font-mono text-xs">{selectedModel || campaignAgent?.model || 'llama-3.1-8b-instant'}</p></div>
            <div><p className="text-gray-400 text-sm">Target</p><p className="text-white mt-1">{campaign.target_count.toLocaleString()} calls</p></div>
            <div><p className="text-gray-400 text-sm">Progress</p><p className="text-white mt-1">{progressPercent.toFixed(1)}%</p></div>
          </div>
        </Card>

        {/* Script & Model Config */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-gray-400" />
                <h3 className="text-lg font-bold text-white">Campaign Script</h3>
              </div>
              <div className="flex items-center gap-3">
                {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
                <button onClick={handleSaveScript} disabled={scriptSaving}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm transition-all-smooth disabled:opacity-40">
                  {scriptSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Save
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              This script overrides the default system prompt. The agent will follow these instructions during calls.
              Leave empty to use the default agent prompt.
            </p>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder={`Enter custom script for this campaign...\n\nBy default the agent uses:\n${campaignAgent?.description || 'Final expense insurance outbound call agent'}`}
              rows={12}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-white/30 resize-y"
            />
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={18} className="text-gray-400" />
              <h3 className="text-lg font-bold text-white">LLM Model</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Override the LLM model for this campaign. Uses the agent&apos;s default model if not set.
            </p>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 mb-3"
            >
              <option value="">Default ({campaignAgent?.model || 'llama-3.1-8b-instant'})</option>
              {[...new Set([...(agentModels.length > 0 ? agentModels : ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768']), 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'])].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button onClick={handleSaveModel} disabled={modelSaving}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm font-medium transition-all-smooth disabled:opacity-40">
              {modelSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Update Model
            </button>

            {/* Process Indicator */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <h4 className="text-sm font-semibold text-gray-400 mb-3">Campaign Process</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${campaign.status !== 'draft' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-500'}`}>1</div>
                  <div><p className="text-white text-sm font-medium">Script Configured</p><p className="text-xs text-gray-500">{scriptText ? 'Custom script ready' : 'Using default prompt'}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${campaign.status === 'active' || campaign.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-500'}`}>2</div>
                  <div><p className="text-white text-sm font-medium">Leads Added</p><p className="text-xs text-gray-500">{leads.length} leads loaded</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${campaign.completed_count > 0 ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-500'}`}>3</div>
                  <div><p className="text-white text-sm font-medium">Calls Made</p><p className="text-xs text-gray-500">{campaign.completed_count} completed ({progressPercent.toFixed(0)}% of target)</p></div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Rebuttals Config */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquareText size={18} className="text-gray-400" />
              <h3 className="text-lg font-bold text-white">Rebuttals (Objection Handling)</h3>
            </div>
            <div className="flex items-center gap-3">
              {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
              <button onClick={handleSaveRebuttals} disabled={rebuttalsSaving}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm transition-all-smooth disabled:opacity-40">
                {rebuttalsSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Save Rebuttals
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Customize how the agent handles specific objections. Leave empty to use the default response.
            These are injected into the agent&apos;s system prompt during calls.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(defaultRebuttals).map(([key, defaultVal]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-400 mb-1 capitalize">
                  {key.replace(/_/g, ' ')}
                </label>
                <textarea
                  value={rebuttals[key] || ''}
                  onChange={(e) => setRebuttals(prev => ({...prev, [key]: e.target.value}))}
                  placeholder={defaultVal}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-white/30 resize-y"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPICard label="Completed" value={campaign.completed_count.toLocaleString()} subtext={`of ${campaign.target_count.toLocaleString()} target`} />
          <KPICard label="Conversions" value={campaign.conversion_count} subtext={`${conversionPercent.toFixed(1)}% rate`} />
          <KPICard label="Pending Leads" value={leads.filter(l => l.status === 'pending').length} subtext="Ready to call" />
          <KPICard label="Called Leads" value={leads.filter(l => l.status === 'called' || l.status === 'conversion' || l.status === 'transferred' || l.status === 'declined').length} subtext="Completed" />
        </div>

        {/* Leads */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Leads ({leads.length})</h3>
            <div className="flex gap-2">
              <button onClick={handleStartDialer} disabled={dialing}
                className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-4 py-2 text-green-400 text-sm font-medium transition-all-smooth disabled:opacity-40">
                {dialing ? <Loader size={16} className="animate-spin" /> : <PhoneCall size={16} />} Call All Pending
              </button>
              <button onClick={() => setShowAddLead(!showAddLead)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm font-medium">
                <Plus size={16} /> Add Lead
              </button>
              <button onClick={async () => { try { await api.leads.exportCSV(campaignId); } catch (e) { alert('Export failed: ' + e); } }}
                className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-400 text-sm font-medium transition-all-smooth">
                <FileText size={16} /> Export CSV
              </button>
              <label className={`flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm font-medium cursor-pointer ${uploadingCsv ? 'opacity-50' : ''}`}>
                <Upload size={16} /> {uploadingCsv ? 'Uploading...' : 'Upload CSV'}
                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={uploadingCsv} />
              </label>
            </div>
          </div>
          {showAddLead && (
            <form onSubmit={handleAddLead} className="flex flex-wrap gap-3 mb-6 p-4 bg-white/5 rounded-lg">
              <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone *" required className="flex-1 min-w-[150px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none" />
              <input type="text" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="First name" className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
              <input type="text" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Last name" className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
              <button type="submit" className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white font-medium">Add</button>
            </form>
          )}
          {leads.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No leads yet. Add leads manually or upload a CSV.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-white/10">
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-left py-3 px-2">Phone</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Result</th>
                    <th className="text-left py-3 px-2">Disposition</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-2 text-white">{lead.first_name} {lead.last_name}</td>
                      <td className="py-3 px-2 font-mono text-gray-300">{lead.phone_number}</td>
                      <td className="py-3 px-2">{getStatusBadge(lead.status)}</td>
                      <td className="py-3 px-2">{lead.call_result ? <Badge variant={lead.call_result === 'conversion' || lead.call_result === 'transferred' ? 'success' : 'error'}>{lead.call_result === 'transferred' ? 'SUCCESS - TRANSFERRED' : lead.call_result === 'declined' ? 'DECLINED' : lead.call_result.toUpperCase()}</Badge> : <span className="text-gray-600">—</span>}</td>
                      <td className="py-3 px-2">{lead.disposition ? <code className="text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded text-xs font-mono">{lead.disposition}</code> : <span className="text-gray-600">—</span>}</td>
                      <td className="py-3 px-2">
                        <div className="flex gap-2 justify-end">
                          {lead.status === 'pending' && (
                            <button onClick={() => handleCallLead(lead)} className="w-8 h-8 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 rounded-lg flex items-center justify-center" title="Call">
                              <PhoneCall size={14} className="text-green-400" />
                            </button>
                          )}
                          {(lead.status === 'called' || lead.status === 'conversion' || lead.status === 'transferred' || lead.status === 'declined' || lead.status === 'failed') && (
                            <button onClick={() => handleViewTranscript(lead)} className="w-8 h-8 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 rounded-lg flex items-center justify-center" title="Transcript">
                              <MessageSquareText size={14} className="text-purple-400" />
                            </button>
                          )}
                          <button onClick={() => handleDeleteLead(lead.id)} disabled={deletingLeadId === lead.id}
                            className="w-8 h-8 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg flex items-center justify-center disabled:opacity-40" title="Delete">
                            {deletingLeadId === lead.id ? <Loader size={14} className="animate-spin text-red-400" /> : <Trash2 size={14} className="text-red-400" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="mb-6"><h3 className="text-lg font-bold text-white">Conversion Split</h3></div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={resultData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value"
                  label={({ name, value }: any) => `${name}: ${value}`}>
                  {resultData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(229, 226, 225, 0.1)', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-6">
              <div><h3 className="text-lg font-bold text-white">Call Records</h3><p className="text-sm text-gray-400 mt-1">{campaignCalls.length} total</p></div>
              <button onClick={async () => { try { await api.calls.exportCSV(campaignId); } catch (e) { alert('Export failed: ' + e); } }}
                className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-400 text-sm font-medium transition-all-smooth">
                <FileText size={16} /> Export CSV
              </button>
            </div>
            <Table columns={callColumns} data={campaignCalls.slice(0, 10)} keyExtractor={(item: CallRecord) => item.id.toString()} />
          </Card>
        </div>
      </div>

      {/* Transcript Modal */}
      {transcriptCall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setTranscriptCall(null)}>
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Call with {transcriptCall.customer_name}</h2>
              <button onClick={() => setTranscriptCall(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              {transcriptCall.transcript.split('\n').map((line, i) => {
                if (!line.trim()) return null;
                const isAgent = line.startsWith('Agent:'); const isCustomer = line.startsWith('Customer:');
                return (
                  <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${isAgent ? 'bg-white/10 text-white' : isCustomer ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-gray-400'}`}>
                      <p className="font-semibold text-xs mb-1 opacity-60">{isAgent ? 'Agent' : isCustomer ? 'Customer' : ''}</p>
                      <p>{line.replace(/^(Agent:|Customer:)\s*/, '')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Chat Modal */}
      {chatOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Call with {chatCustomerName}</h2>
                <p className="text-xs text-gray-500">{chatEnded ? 'Call ended' : 'In progress'}</p>
              </div>
              <div className="flex items-center gap-2">
                {!chatEnded && (
                  <button onClick={handleStopCall} disabled={stoppingCall}
                    className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg px-3 py-1.5 text-red-300 text-sm font-medium transition-all-smooth disabled:opacity-40"
                    title="Stop call">
                    {stoppingCall ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />} Stop
                  </button>
                )}
                <button onClick={() => setChatOpen(false)} className="p-2 hover:bg-white/10 rounded-lg"><X size={20} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[400px] pr-2 mb-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${msg.role === 'agent' ? 'bg-white/10 text-white' : 'bg-blue-500/20 text-blue-200'}`}>
                    <p className="font-semibold text-xs mb-1 opacity-60">{msg.role === 'agent' ? 'Agent' : 'You'}</p>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}
              {chatSending && <div className="flex justify-start"><div className="bg-white/10 rounded-lg px-4 py-2.5"><Loader size={16} className="animate-spin text-gray-400" /></div></div>}
              <div ref={chatBottomRef} />
            </div>
            {!chatEnded ? (
              <div className="flex gap-2 border-t border-white/10 pt-4">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder="Type your response..." disabled={chatSending}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none disabled:opacity-40" />
                <button onClick={handleSendMessage} disabled={!chatInput.trim() || chatSending}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2.5 text-white disabled:opacity-40">
                  <Send size={18} />
                </button>
              </div>
            ) : <p className="text-center text-gray-500 text-sm pt-2">Call completed.</p>}
          </Card>
        </div>
      )}
    </MainLayout>
    </ProtectedRoute>
  );
}
