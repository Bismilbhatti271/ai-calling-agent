'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { api, Campaign, Lead, Agent, DialerStatus } from '@/lib/api';
import { API_BASE } from '@/lib/live-data';
import { Play, Square, Upload, Plus, Trash2, Phone, RotateCw, Loader, MessageSquareText, X, Send, PhoneCall, Server, RefreshCw, FileText, StopCircle } from 'lucide-react';

interface ChatMessage {
  role: 'agent' | 'customer' | 'human_agent';
  text: string;
}

export default function OutboundPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dialerStatus, setDialerStatus] = useState<DialerStatus | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);

  const [showAddLead, setShowAddLead] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<number | null>(null);

  const [transcriptCall, setTranscriptCall] = useState<{ id: number; transcript: string; customer_name: string; age?: number | null; duration?: number } | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  // VICIdial mode
  const [vicidialMode, setVicidialMode] = useState(false);
  const [vicidialConnected, setVicidialConnected] = useState(false);

  useEffect(() => {
    // Check if VICIdial mode is enabled in config
    fetch(`${API_BASE}/vicidial/status`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('empirex_token')}` }
    })
    .then(r => r.json())
    .then(data => {
      setVicidialMode(data.mode === 'vicidial');
      setVicidialConnected(data.connected);
    })
    .catch(() => {});
  }, []);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLead, setChatLead] = useState<Lead | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [chatCallId, setChatCallId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const transcriptSinceIndexRef = useRef(0);
  const transcriptIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [stoppingCall, setStoppingCall] = useState(false);

  // Transfer state
  const [transferPending, setTransferPending] = useState(false);
  const [transferAccepted, setTransferAccepted] = useState(false);
  const [humanTalking, setHumanTalking] = useState(false);
  const [transferNotif, setTransferNotif] = useState<{ session_id: number; customer_name: string; created_at: number } | null>(null);
  const pendingTransfersIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    api.campaigns.list().then(setCampaigns);
    api.agents.list().then(setAgents);
  }, []);

  const loadLeads = useCallback(async (campaignId: number, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoadingLeads(true);
    const [leadList, status] = await Promise.all([
      api.leads.list(campaignId),
      api.leads.dialerStatus(campaignId),
    ]);
    setLeads(leadList);
    setDialerStatus(status);
    setLoadingLeads(false);
    if (isManualRefresh) setRefreshing(false);
  }, []);

  const handleRefresh = () => {
    if (selectedCampaignId) loadLeads(selectedCampaignId, true);
  };

  useEffect(() => {
    if (selectedCampaignId) {
      loadLeads(selectedCampaignId);
      const interval = setInterval(() => {
        if (selectedCampaignId) {
          api.leads.list(selectedCampaignId).then(setLeads);
          api.leads.dialerStatus(selectedCampaignId).then(setDialerStatus);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedCampaignId, loadLeads]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Poll for pending transfers from other calls
  useEffect(() => {
    if (!chatOpen) {
      pendingTransfersIntervalRef.current = setInterval(async () => {
        try {
          const transfers = await api.calling.pendingTransfers();
          if (transfers.length > 0) {
            // Show a notification for the first pending transfer that's not ours
            const activeTransfer = transfers.find(t => t.status === 'pending' && t.session_id !== chatSessionId);
            if (activeTransfer) {
              setTransferNotif({
                session_id: activeTransfer.session_id,
                customer_name: activeTransfer.customer_name,
                created_at: activeTransfer.created_at,
              });
            }
          } else {
            setTransferNotif(null);
          }
        } catch { }
      }, 3000);
    }
    return () => {
      if (pendingTransfersIntervalRef.current) {
        clearInterval(pendingTransfersIntervalRef.current);
        pendingTransfersIntervalRef.current = null;
      }
    };
  }, [chatOpen, chatSessionId]);

  useEffect(() => {
    return () => {
      if (transcriptIntervalRef.current) {
        clearInterval(transcriptIntervalRef.current);
        transcriptIntervalRef.current = null;
      }
      if (pendingTransfersIntervalRef.current) {
        clearInterval(pendingTransfersIntervalRef.current);
        pendingTransfersIntervalRef.current = null;
      }
    };
  }, []);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  const handleStartDialer = async () => {
    if (!selectedCampaignId) return;
    await api.leads.dial(selectedCampaignId);
    loadLeads(selectedCampaignId);
  };

  const handleStopDialer = async () => {
    if (!selectedCampaignId) return;
    await api.leads.stop(selectedCampaignId);
    loadLeads(selectedCampaignId);
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId || !newPhone.trim()) return;
    await api.leads.create({
      campaign_id: selectedCampaignId,
      phone_number: newPhone.trim(),
      first_name: newFirstName.trim(),
      last_name: newLastName.trim(),
    });
    setNewPhone('');
    setNewFirstName('');
    setNewLastName('');
    setShowAddLead(false);
    loadLeads(selectedCampaignId);
  };

  const handleDeleteLead = async (leadId: number) => {
    if (!window.confirm('Delete this lead?')) return;
    setDeletingLeadId(leadId);
    try {
      await api.leads.delete(leadId);
      if (selectedCampaignId) loadLeads(selectedCampaignId);
    } finally {
      setDeletingLeadId(null);
    }
  };

  const handleCallNow = async (lead: Lead) => {
    if (!selectedCampaign) return;
    setChatLead(lead);
    setChatMessages([]);
    setChatCallId(null);
    setChatEnded(false);
    setVoiceMode(true);
    transcriptSinceIndexRef.current = 0;
    setChatOpen(true);

    // Clear any existing polling
    if (transcriptIntervalRef.current) {
      clearInterval(transcriptIntervalRef.current);
      transcriptIntervalRef.current = null;
    }

    try {
      const agentId = selectedAgentId || selectedCampaign.agent_id;
      const result = await api.calling.startVoiceChat({
        campaign_id: selectedCampaignId!,
        agent_id: agentId,
        phone_number: lead.phone_number,
        customer_name: lead.first_name || 'there',
        lead_id: lead.id,
      });
      setChatSessionId(result.session_id);
      setChatCallId(result.call_id);
      setChatMessages([{ role: 'agent', text: result.pitch }]);
      if (selectedCampaignId) loadLeads(selectedCampaignId);

      // Start polling for transcript updates
      transcriptIntervalRef.current = setInterval(async () => {
        try {
          const transcript = await api.calling.getTranscript(result.session_id, transcriptSinceIndexRef.current);
          transcriptSinceIndexRef.current = Math.max(transcriptSinceIndexRef.current, transcript.total_lines);
          if (transcript.lines.length > 0) {
            setChatMessages(prev => {
              const newMsgs = [...prev];
              const existingTexts = new Set(prev.map(m => m.text));
              for (const line of transcript.lines) {
                if (!line.trim()) continue;
                const isAgent = line.startsWith('Agent:') || line.startsWith('Human Agent:');
                const isHuman = line.startsWith('Human Agent:');
                const text = line.replace(/^(Agent:|Customer:|Human Agent:)\s*/, '').trim();
                if (text && !existingTexts.has(text)) {
                  newMsgs.push({ 
                    role: isAgent ? (isHuman ? 'human_agent' : 'agent') : 'customer', 
                    text 
                  });
                  existingTexts.add(text);
                }
              }
              return newMsgs;
            });
          }
          
          // Check for transfer state changes
          if (transcript.session?.transfer_pending && !transferPending && !transferAccepted) {
            setTransferPending(true);
          }
          if (transcript.session?.transfer_accepted && !transferAccepted) {
            setTransferAccepted(true);
            setTransferPending(false);
            setHumanTalking(false);
          }
          if (transcript.session?.human_talking && !humanTalking) {
            setHumanTalking(true);
            setVoiceMode(false); // Switch from voice to text mode
          }
          // Also update voice mode state based on transfer
          if (transferAccepted && voiceMode) {
            setVoiceMode(false);
          }
          
          if (transcript.call_ended) {
            setChatEnded(true);
            setTransferPending(false);
            setTransferAccepted(false);
            setHumanTalking(false);
            if (selectedCampaignId) loadLeads(selectedCampaignId);
            if (transcriptIntervalRef.current) {
              clearInterval(transcriptIntervalRef.current);
              transcriptIntervalRef.current = null;
            }
          }
        } catch {
          // Polling error - ignore
        }
      }, 2000);
    } catch (e: any) {
      setChatMessages([{ role: 'agent', text: 'Failed to start call: ' + e.message }]);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatSending || chatEnded || !chatSessionId || !selectedCampaign) return;
    const msg = chatInput.trim();
    setChatInput('');
    const userRole: ChatMessage['role'] = humanTalking ? 'human_agent' : 'customer';
    setChatMessages((prev) => [...prev, { role: userRole, text: msg }]);
    setChatSending(true);

    // Stop transcript polling when user types in voice mode
    if (voiceMode && transcriptIntervalRef.current) {
      clearInterval(transcriptIntervalRef.current);
      transcriptIntervalRef.current = null;
      setVoiceMode(false);
    }

    try {
      // If human is talking (transfer accepted), use human message endpoint
      if (humanTalking) {
        const result = await api.calling.sendHumanMessage({
          session_id: chatSessionId,
          message: msg,
          campaign_id: selectedCampaignId!,
          agent_id: selectedAgentId || selectedCampaign.agent_id,
          phone_number: chatLead?.phone_number || '',
          customer_name: chatLead?.first_name || 'there',
          lead_id: chatLead?.id,
          call_id: chatCallId ?? undefined,
        });
        // The human message is echoed back - no AI reply needed
      } else {
        const result = await api.calling.sendMessage({
          session_id: chatSessionId,
          message: msg,
          campaign_id: selectedCampaignId!,
          agent_id: selectedAgentId || selectedCampaign.agent_id,
          phone_number: chatLead?.phone_number || '',
          customer_name: chatLead?.first_name || 'there',
          lead_id: chatLead?.id,
          call_id: chatCallId ?? undefined,
        });
        setChatMessages((prev) => [...prev, { role: 'agent', text: result.reply }]);
        if (result.call_ended) {
          setChatEnded(true);
          if (selectedCampaignId) loadLeads(selectedCampaignId);
        }
      }
    } catch (e: any) {
      setChatMessages((prev) => [...prev, { role: 'agent', text: 'Error: ' + e.message }]);
    } finally {
      setChatSending(false);
    }
  };

  const handleStopCall = async () => {
    if (!window.confirm('Stop this call?')) return;
    setStoppingCall(true);
    try {
      await api.calling.stopCall({
        session_id: chatSessionId ?? undefined,
        call_id: chatCallId ?? undefined,
        lead_id: chatLead?.id ?? undefined,
        campaign_id: selectedCampaignId ?? undefined,
      });
      setChatEnded(true);
      setChatMessages((prev) => [...prev, { role: 'agent', text: 'Call ended.' }]);
      if (selectedCampaignId) loadLeads(selectedCampaignId);
      if (transcriptIntervalRef.current) {
        clearInterval(transcriptIntervalRef.current);
        transcriptIntervalRef.current = null;
      }
    } catch (e: any) {
      setChatMessages((prev) => [...prev, { role: 'agent', text: 'Error stopping call: ' + e.message }]);
    } finally {
      setStoppingCall(false);
    }
  };

  const handleCloseChat = () => {
    setChatOpen(false);
    if (transcriptIntervalRef.current) {
      clearInterval(transcriptIntervalRef.current);
      transcriptIntervalRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRecall = async (lead: Lead) => {
    setCallingLeadId(lead.id);
    try {
      await api.calling.recall(lead.id);
      if (selectedCampaignId) loadLeads(selectedCampaignId);
    } catch (e: any) {
      alert('Recall failed: ' + e.message);
    } finally {
      setCallingLeadId(null);
    }
  };

  const handleViewTranscript = async (lead: Lead) => {
    try {
      const calls = await api.calls.list(selectedCampaignId!);
      const call = calls.find((c) => c.phone_number === lead.phone_number && (c.result !== 'in_progress'));
      if (call) {
        const detail = (call as any).transcript ? call : await api.calls.get(call.id);
        setTranscriptCall({
          id: detail.id,
          transcript: (detail as any).transcript || 'No transcript available',
          customer_name: lead.first_name || 'Customer',
          age: (detail as any).age_collected,
          duration: (detail as any).duration_seconds,
        });
      } else {
        alert('No call record found for this lead');
      }
    } catch {
      alert('Could not load transcript');
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaignId) return;
    setUploadingCsv(true);
    try {
      const form = new FormData();
      form.append('campaign_id', selectedCampaignId.toString());
      form.append('file', file);
      await fetch(`${API_BASE}/leads/upload-csv`, { method: 'POST', body: form });
      if (selectedCampaignId) loadLeads(selectedCampaignId);
    } catch (e: any) {
      alert('CSV upload failed: ' + e.message);
    } finally {
      setUploadingCsv(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'PENDING',
      calling: 'ON THE WAY',
      called: 'SUCCESS',
      failed: 'SUCCESS',
      conversion: 'SUCCESS',
      transferred: 'SUCCESS - TRANSFERRED',
      declined: 'DECLINED',
    };
    const variants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
      pending: 'warning',
      calling: 'warning',
      called: 'success',
      failed: 'success',
      conversion: 'success',
      transferred: 'success',
      declined: 'error',
    };
    return <Badge variant={variants[status] || 'default'}>{labels[status] || status.toUpperCase()}</Badge>;
  };

  return (
    <ProtectedRoute>
      <MainLayout title="Outbound Dialer" breadcrumbs={[{ label: 'Outbound' }]}>
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm font-medium">Campaign</p>
              {/* VICIdial Mode Indicator */}
              {vicidialMode && (
                <a href="/vicidial" className="flex items-center gap-2 text-xs">
                  {vicidialConnected ? (
                    <span className="flex items-center gap-1.5 text-green-400">
                      <Server size={14} />
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                      VICIdial Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-yellow-400">
                      <Server size={14} />
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                      VICIdial Mode
                    </span>
                  )}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => setSelectedCampaignId(e.target.value ? parseInt(e.target.value) : null)}
                className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
              >
                <option value="">Select a campaign...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                ))}
              </select>

              {selectedCampaign && agents.length > 0 && (
                <select
                  value={selectedAgentId ?? selectedCampaign.agent_id}
                  onChange={(e) => setSelectedAgentId(parseInt(e.target.value) || null)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30"
                  title="Override agent for calls"
                >
                  <option value={selectedCampaign.agent_id}>Agent: {selectedCampaign.agent_name || agents.find(a => a.id === selectedCampaign.agent_id)?.name || 'Default'}</option>
                  {agents.filter(a => a.id !== selectedCampaign.agent_id).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}

              {selectedCampaign && (
                <div className="flex gap-2">
                  {!vicidialMode && (
                    <>
                      <button onClick={handleStartDialer} disabled={dialerStatus?.active}
                        className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg px-4 py-2.5 text-green-400 font-medium transition-all-smooth disabled:opacity-40">
                        <Play size={16} /> Auto Dial
                      </button>
                      <button onClick={handleStopDialer} disabled={!dialerStatus?.active}
                        className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 font-medium transition-all-smooth disabled:opacity-40">
                        <Square size={16} /> Stop
                      </button>
                    </>
                  )}
                  {vicidialMode && (
                    <a href="/vicidial"
                      className="flex items-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg px-4 py-2.5 text-purple-400 font-medium transition-all-smooth">
                      <Server size={16} /> VICIdial Controls
                    </a>
                  )}
                </div>
              )}
            </div>

            {dialerStatus && (
              <div className="mt-4 flex gap-6 text-sm">
                <span className="text-gray-400">Pending: <strong className="text-white">{dialerStatus.pending}</strong></span>
                <span className="text-gray-400">Called: <strong className="text-white">{dialerStatus.called}</strong></span>
                <span className="text-gray-400">Conversions: <strong className="text-green-400">{dialerStatus.conversions}</strong></span>
                {dialerStatus.active && <span className="text-yellow-400 animate-pulse">● Dialing...</span>}
              </div>
            )}
          </Card>

          {selectedCampaignId && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Leads</h3>
                  <p className="text-sm text-gray-400 mt-1">{leads.length} total</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleRefresh} disabled={refreshing}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth disabled:opacity-40">
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={() => setShowAddLead(!showAddLead)}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm font-medium transition-all-smooth">
                    <Plus size={16} /> Add Lead
                  </button>
                  <button onClick={async () => { try { await api.leads.exportCSV(selectedCampaignId!); } catch (e) { alert('Export failed: ' + e); } }}
                    className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-400 text-sm font-medium transition-all-smooth">
                    <FileText size={16} /> Export CSV
                  </button>
                  <label className={`flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm font-medium transition-all-smooth cursor-pointer ${uploadingCsv ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload size={16} /> {uploadingCsv ? 'Uploading...' : 'Upload CSV'}
                    <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={uploadingCsv} />
                  </label>
                </div>
              </div>

              {showAddLead && (
                <form onSubmit={handleAddLead} className="flex flex-wrap gap-3 mb-6 p-4 bg-white/5 rounded-lg">
                  <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone *" required
                    className="flex-1 min-w-[150px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30" />
                  <input type="text" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="First name"
                    className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30" />
                  <input type="text" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Last name"
                    className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30" />
                  <button type="submit"
                    className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white font-medium transition-all-smooth">
                    Add
                  </button>
                </form>
              )}

              {loadingLeads ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="animate-spin text-gray-400" size={24} />
                </div>
              ) : leads.length === 0 ? (
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
                        <th className="text-left py-3 px-2">Disp.</th>
                        <th className="text-left py-3 px-2">Age</th>
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
                          <td className="py-3 px-2 text-gray-300">{lead.age_collected ?? '—'}</td>
                          <td className="py-3 px-2">
                            <div className="flex gap-2 justify-end">
                              {lead.status === 'pending' && (
                                <button onClick={() => handleCallNow(lead)}
                                  className="w-8 h-8 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 rounded-lg flex items-center justify-center transition-all-smooth"
                                  title="Call now">
                                  <PhoneCall size={14} className="text-green-400" />
                                </button>
                              )}
                              {(lead.status === 'called' || lead.status === 'failed' || lead.status === 'declined' || lead.status === 'conversion' || lead.status === 'transferred') && (
                                <>
                                  <button onClick={() => handleViewTranscript(lead)}
                                    className="w-8 h-8 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 rounded-lg flex items-center justify-center transition-all-smooth"
                                    title="View transcript">
                                    <MessageSquareText size={14} className="text-purple-400" />
                                  </button>
                                  <button onClick={() => handleRecall(lead)} disabled={callingLeadId === lead.id}
                                    className="w-8 h-8 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 rounded-lg flex items-center justify-center transition-all-smooth disabled:opacity-40"
                                    title="Recall">
                                    {callingLeadId === lead.id ? <Loader size={14} className="text-blue-400 animate-spin" /> : <RotateCw size={14} className="text-blue-400" />}
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleDeleteLead(lead.id)} disabled={deletingLeadId === lead.id}
                                className="w-8 h-8 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg flex items-center justify-center transition-all-smooth disabled:opacity-40"
                                title="Delete">
                                {deletingLeadId === lead.id ? <Loader size={14} className="text-red-400 animate-spin" /> : <Trash2 size={14} className="text-red-400" />}
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
          )}

          {!selectedCampaignId && (
            <Card className="text-center py-12">
              <Phone size={48} className="mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400 text-lg">Select a campaign to view leads</p>
              <p className="text-gray-600 text-sm mt-2">Manage leads, start the dialer, and track results</p>
            </Card>
          )}
        </div>

        {/* Transcript Modal */}
        {transcriptCall && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setTranscriptCall(null)}>
            <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Call with {transcriptCall.customer_name}</h2>
                <button onClick={() => setTranscriptCall(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              {/* Call Info */}
              <div className="flex gap-4 mb-6 p-4 bg-white/5 rounded-lg">
                {transcriptCall.age != null && (
                  <div>
                    <p className="text-xs text-gray-500">Age</p>
                    <p className="text-lg font-bold text-white">{transcriptCall.age}</p>
                  </div>
                )}
                {transcriptCall.duration != null && transcriptCall.duration > 0 && (
                  <div>
                    <p className="text-xs text-gray-500">Duration</p>
                    <p className="text-lg font-bold text-white">
                      {Math.floor(transcriptCall.duration / 60)}:{transcriptCall.duration % 60 < 10 ? '0' : ''}{transcriptCall.duration % 60}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">Result</p>
                  <Badge variant="success">SUCCESS - TRANSFERRED</Badge>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Conversation</h3>
              <div className="space-y-3">
                {transcriptCall.transcript.split('\n').map((line, i) => {
                  if (!line.trim()) return null;
                  const isAgent = line.startsWith('Agent:');
                  const isCustomer = line.startsWith('Customer:');
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
                  <h2 className="text-lg font-bold text-white">Call with {chatLead?.first_name || chatLead?.phone_number}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-500">
                      {chatEnded ? 'Call ended' : voiceMode ? 'Voice call in progress...' : humanTalking ? 'You are talking to the customer' : transferPending ? 'AI requesting transfer...' : transferAccepted ? 'Transfer accepted, connecting...' : 'In progress'}
                    </p>
                    {voiceMode && !chatEnded && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        Voice
                      </span>
                    )}
                    {transferPending && !chatEnded && (
                      <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                        Transfer Requested
                      </span>
                    )}
                    {humanTalking && !chatEnded && (
                      <span className="flex items-center gap-1 text-xs text-purple-400">
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                        Human Mode
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!chatEnded && (
                    <button onClick={handleStopCall} disabled={stoppingCall}
                      className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg px-3 py-1.5 text-red-300 text-sm font-medium transition-all-smooth disabled:opacity-40"
                      title="Stop call">
                      {stoppingCall ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />} Stop
                    </button>
                  )}
                  <button onClick={handleCloseChat} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Transfer Request Notification */}
              {transferPending && !transferAccepted && !chatEnded && (
                <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                  <p className="text-yellow-300 text-sm font-medium mb-3">
                    🔔 The AI agent has qualified this lead and is requesting a transfer to you!
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={async () => {
                        if (!chatSessionId) return;
                        try {
                          await api.calling.acceptTransfer(chatSessionId);
                          setTransferPending(false);
                          setTransferAccepted(true);
                          setVoiceMode(false);
                        } catch (e: any) {
                          alert('Accept failed: ' + e.message);
                        }
                      }}
                      className="px-6 py-2.5 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 rounded-lg text-green-400 font-medium transition-all-smooth"
                    >
                      Accept Transfer
                    </button>
                    <button
                      onClick={async () => {
                        if (!chatSessionId) return;
                        try {
                          await api.calling.declineTransfer(chatSessionId);
                          setTransferPending(false);
                          setChatEnded(true);
                        } catch (e: any) {
                          alert('Decline failed: ' + e.message);
                        }
                      }}
                      className="px-6 py-2.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg text-red-400 font-medium transition-all-smooth"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Transfer Accepted Notification */}
              {transferAccepted && !humanTalking && !chatEnded && (
                <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <p className="text-blue-300 text-sm font-medium">
                    ⏳ Transfer accepted! AI agent is disconnecting (3 seconds)... You will be able to talk to the customer shortly.
                  </p>
                </div>
              )}

              {/* Human Talking Mode Notification */}
              {humanTalking && !chatEnded && (
                <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <p className="text-purple-300 text-sm font-medium mb-2">
                    🎙️ You are now talking to {chatLead?.first_name || 'the customer'}. Type your messages below.
                  </p>
                  <button
                    onClick={async () => {
                      if (!chatSessionId) return;
                      try {
                        await api.calling.completeTransfer(chatSessionId);
                        setHumanTalking(false);
                        setChatEnded(true);
                        if (selectedCampaignId) loadLeads(selectedCampaignId);
                      } catch (e: any) {
                        alert('Complete failed: ' + e.message);
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 rounded-lg text-green-400 font-medium transition-all-smooth"
                  >
                    Complete Transfer & End Call
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[400px] pr-2 mb-4">
                {voiceMode && !chatEnded && chatMessages.length <= 1 && !transferPending && (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm">Voice call active — speak into your mic.</p>
                    <p className="text-gray-600 text-xs mt-1">The conversation will appear here in real-time.</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'agent' || msg.role === 'human_agent' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                      msg.role === 'agent'
                        ? 'bg-white/10 text-white'
                        : msg.role === 'human_agent'
                        ? 'bg-purple-500/20 text-purple-200'
                        : 'bg-blue-500/20 text-blue-200'
                    }`}>
                      <p className="font-semibold text-xs mb-1 opacity-60">
                        {msg.role === 'agent' ? 'AI Agent' : msg.role === 'human_agent' ? 'You (Human)' : 'Customer'}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {chatSending && (
                  <div className="flex justify-start">
                    <div className="bg-white/10 rounded-lg px-4 py-2.5">
                      <Loader size={16} className="animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {!chatEnded ? (
                <div className="flex gap-2 border-t border-white/10 pt-4">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={humanTalking ? "Type your message to the customer..." : voiceMode ? "Type to send (switches to text mode)..." : "Type your response..."}
                    disabled={chatSending}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 disabled:opacity-40"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || chatSending}
                    className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2.5 text-white transition-all-smooth disabled:opacity-40"
                  >
                    <Send size={18} />
                  </button>
                </div>
              ) : (
                <p className="text-center text-gray-500 text-sm pt-2">
                  {transferAccepted && !humanTalking ? 'Transfer completed. Close to return to leads.' : 'Call completed. Close to return to leads.'}
                </p>
              )}
            </Card>
          </div>
        )}

        {/* Global Transfer Notification */}
        {transferNotif && !chatOpen && (
          <div className="fixed top-4 right-4 z-50 max-w-sm">
            <Card className="p-4 border-yellow-500/30">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-yellow-300 text-sm font-medium">🔔 Transfer Request</p>
                  <p className="text-gray-300 text-xs mt-1">
                    AI agent wants to transfer a qualified lead ({transferNotif.customer_name}) to you
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={async () => {
                        try {
                          await api.calling.acceptTransfer(transferNotif.session_id);
                          setTransferNotif(null);
                          // Open chat for this transfer
                          setChatOpen(true);
                          setTransferAccepted(true);
                        } catch (e: any) {
                          alert('Accept failed: ' + e.message);
                        }
                      }}
                      className="px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-medium"
                    >
                      Accept
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.calling.declineTransfer(transferNotif.session_id);
                          setTransferNotif(null);
                        } catch { }
                      }}
                      className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs font-medium"
                    >
                      Decline
                    </button>
                  </div>
                </div>
                <button onClick={() => setTransferNotif(null)} className="text-gray-500 hover:text-gray-300">
                  <X size={16} />
                </button>
              </div>
            </Card>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}