'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTickets, Ticket } from '@/lib/tickets-context';
import { api } from '@/lib/api';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Plus, MessageCircle, Copy, CheckCircle2, AlertCircle, Clock, Send, Loader2, RefreshCw } from 'lucide-react';

export default function TicketsPage() {
  const { user } = useAuth();
  const { tickets, loading, createTicket, replyToTicket, refreshTickets } = useTickets();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newTicket, setNewTicket] = useState({
    subject: '',
    message: '',
  });
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const userTickets = tickets.filter((t) => String(t.user_id) === String(user?.id));

  // Fetch full ticket details with replies when selected
  useEffect(() => {
    if (selectedTicketId) {
      setLoadingDetail(true);
      api.tickets.get(parseInt(selectedTicketId))
        .then((data) => {
          const mapped = {
            ...data,
            id: String(data.id),
            user_id: data.user_id,
            created_at: new Date(data.created_at),
            updated_at: new Date(data.updated_at),
            replies: (data.replies || []).map((r: any) => ({
              ...r,
              created_at: new Date(r.created_at || Date.now()),
            })),
          };
          setSelectedTicket(mapped as any);
        })
        .catch(() => {})
        .finally(() => setLoadingDetail(false));
    } else {
      setSelectedTicket(null);
    }
  }, [selectedTicketId, detailRefreshKey]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
  };

  const handleCreateTicket = async () => {
    if (!newTicket.subject || !newTicket.message) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    setCreating(true);
    try {
      const result = await createTicket(newTicket.subject, newTicket.message);
      setMessage({ type: 'success', text: `Ticket created! Token: ${result.token}` });
      setNewTicket({ subject: '', message: '' });
      setShowCreateModal(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create ticket' });
    } finally {
      setCreating(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await replyToTicket(selectedTicket.id, replyText.trim());
      setReplyText('');
      // Re-fetch detail to show the new reply immediately
      setDetailRefreshKey((k) => k + 1);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to send reply' });
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle size={16} className="text-red-400" />;
      case 'in_progress':
        return <Clock size={16} className="text-yellow-400" />;
      case 'resolved':
        return <CheckCircle2 size={16} className="text-green-400" />;
      default:
        return null;
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setMessage({ type: 'success', text: 'Token copied to clipboard!' });
    setTimeout(() => setMessage({ type: 'success', text: '' }), 2000);
  };

  return (
    <ProtectedRoute>
      <MainLayout title="Support Tickets" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Tickets' }]}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Support Tickets</h1>
              <p className="text-muted-foreground mt-1">Create and manage your support requests</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => { setRefreshing(true); await refreshTickets(); setRefreshing(false); }}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus size={20} />
                New Ticket
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Open Tickets</p>
                  <p className="text-2xl font-bold mt-1">{userTickets.filter((t) => t.status === 'open').length}</p>
                </div>
                <AlertCircle size={24} className="text-red-400 opacity-20" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold mt-1">{userTickets.filter((t) => t.status === 'in_progress').length}</p>
                </div>
                <Clock size={24} className="text-yellow-400 opacity-20" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                  <p className="text-2xl font-bold mt-1">{userTickets.filter((t) => t.status === 'resolved').length}</p>
                </div>
                <CheckCircle2 size={24} className="text-green-400 opacity-20" />
              </div>
            </Card>
          </div>

          {/* Tickets List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              My Tickets ({userTickets.length})
            </h3>

            {loading ? (
              <Card className="p-8 text-center">
                <Loader2 size={32} className="mx-auto text-muted-foreground mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading tickets...</p>
              </Card>
            ) : userTickets.length === 0 ? (
              <Card className="p-8 text-center">
                <MessageCircle size={32} className="mx-auto text-muted-foreground mb-4 opacity-50" />
                <p className="text-muted-foreground">No support tickets yet. Create one to get started.</p>
              </Card>
            ) : (
              userTickets.map((ticket) => (
                <Card
                  key={ticket.id}
                  className="p-4 cursor-pointer hover:bg-white/10 transition-all"
                  onClick={() => handleSelectTicket(ticket)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(ticket.status)}
                        <h4 className="font-semibold">{ticket.subject}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{ticket.message}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {ticket.status === 'open' && 'Open'}
                          {ticket.status === 'in_progress' && 'In Progress'}
                          {ticket.status === 'resolved' && 'Resolved'}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="font-mono">{ticket.token}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyToken(ticket.token);
                            }}
                            className="p-1 hover:text-foreground"
                            title="Copy token"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {ticket.created_at.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Ticket Details Modal */}
          {loadingDetail && (
            <Card className="p-8 text-center">
              <Loader2 size={32} className="mx-auto text-muted-foreground animate-spin" />
              <p className="text-muted-foreground mt-2">Loading ticket details...</p>
            </Card>
          )}
          {selectedTicket && !loadingDetail && (
            <Card>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{selectedTicket.subject}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Token: <span className="font-mono">{selectedTicket.token}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTicketId(null)}
                    className="text-muted-foreground hover:text-foreground text-lg"
                  >
                    ✕
                  </button>
                </div>

                {/* Original Message */}
                <div className="pb-4 border-b border-border">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {selectedTicket.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{selectedTicket.user_name}</span> • {selectedTicket.created_at.toLocaleString()}
                      </p>
                      <p className="text-sm mt-1">{selectedTicket.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 ml-11">
                    <Badge variant="secondary">
                      {selectedTicket.status === 'open' && 'Open'}
                      {selectedTicket.status === 'in_progress' && 'In Progress'}
                      {selectedTicket.status === 'resolved' && 'Resolved'}
                    </Badge>
                  </div>
                </div>

                {/* Replies */}
                {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                  <div className="py-4 space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Replies</p>
                    {selectedTicket.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className={`flex items-start gap-3 ${reply.is_admin ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          reply.is_admin ? 'bg-green-500/20 text-green-400' : 'bg-primary/20'
                        }`}>
                          {reply.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div className={`flex-1 max-w-[80%] ${reply.is_admin ? 'text-right' : ''}`}>
                          <div className={`p-3 rounded-lg ${
                            reply.is_admin
                              ? 'bg-green-500/10 border border-green-500/20'
                              : 'bg-white/5 border border-border'
                          }`}>
                            <p className={`text-xs mb-1 ${
                              reply.is_admin ? 'text-green-300' : 'text-muted-foreground'
                            }`}>
                              {reply.is_admin ? 'Admin' : reply.user_name}
                            </p>
                            <p className="text-sm">{reply.message}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {reply.created_at.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Input */}
                {selectedTicket.status !== 'resolved' && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex gap-3">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={2}
                        className="flex-1 px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors resize-none text-sm"
                        placeholder="Type your reply..."
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sendingReply}
                        className="px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
                      >
                        {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {selectedTicket.status === 'resolved' && (
                  <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                    <CheckCircle2 className="w-6 h-6 mx-auto text-green-400 mb-2" />
                    <p className="text-sm text-green-200 font-medium">This ticket has been resolved</p>
                  </div>
                )}

                <button
                  onClick={() => setSelectedTicketId(null)}
                  className="mt-4 px-4 py-2.5 w-full bg-white/10 border border-border text-foreground font-medium rounded-lg hover:bg-white/20 transition-colors"
                >
                  Close
                </button>
              </div>
            </Card>
          )}

          {/* Create Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-md">
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Create New Support Ticket</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Subject</label>
                      <input
                        type="text"
                        value={newTicket.subject}
                        onChange={(e) => setNewTicket((prev) => ({ ...prev, subject: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder="Brief description of your issue"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Message</label>
                      <textarea
                        value={newTicket.message}
                        onChange={(e) => setNewTicket((prev) => ({ ...prev, message: e.target.value }))}
                        rows={5}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors resize-none"
                        placeholder="Describe your issue in detail..."
                      />
                    </div>

                    <div className="text-xs text-muted-foreground">
                      After creation, you'll receive a token to track your ticket
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowCreateModal(false);
                        setNewTicket({ subject: '', message: '' });
                      }}
                      className="flex-1 px-4 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTicket}
                      disabled={creating}
                      className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Create Ticket
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Message Toast */}
          {message && message.text && (
            <div
              className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg text-sm font-medium transition-all z-50 ${
                message.type === 'success'
                  ? 'bg-green-500/20 border border-green-500/50 text-green-200'
                  : 'bg-red-500/20 border border-red-500/50 text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
