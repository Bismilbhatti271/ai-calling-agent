'use client';

import { useState, useEffect } from 'react';
import { AdminRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { useTickets, Ticket } from '@/lib/tickets-context';
import { api } from '@/lib/api';
import { MessageCircle, Copy, CheckCircle2, AlertCircle, Clock, Send, Loader2, RefreshCw } from 'lucide-react';

export default function AdminTicketsPage() {
  const { tickets, loading, updateTicket, replyToTicket, resolveTicket, refreshTickets } = useTickets();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filteredTickets = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

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

  const handleRespond = async () => {
    if (!selectedTicket || !response.trim()) return;
    setSending(true);
    setError(null);
    try {
      await replyToTicket(selectedTicket.id, response.trim());
      setResponse('');
      // Re-fetch detail to show the new reply immediately
      setDetailRefreshKey((k) => k + 1);
    } catch (err: any) {
      setError(err.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async (id: string) => {
    setResolving(true);
    try {
      await resolveTicket(id);
      // Re-fetch detail to show resolved state
      setDetailRefreshKey((k) => k + 1);
    } catch (err: any) {
      setError(err.message || 'Failed to resolve ticket');
    } finally {
      setResolving(false);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    alert('Token copied to clipboard!');
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'low':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <AdminRoute>
      <MainLayout title="Support Tickets" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Tickets' }]}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Support Tickets</h1>
              <p className="text-muted-foreground mt-1">Manage user support requests and tickets</p>
            </div>
            <button
              onClick={async () => { setRefreshing(true); await refreshTickets(); setRefreshing(false); }}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 glass hover:bg-white/10 rounded-lg transition-colors text-sm disabled:opacity-40"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'open', 'in_progress', 'resolved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === status
                    ? 'bg-primary text-primary-foreground'
                    : 'glass hover:bg-white/10'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                {' '}
                ({filter === 'all' ? tickets.length : tickets.filter((t) => t.status === status).length})
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Tickets List */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">
                Tickets ({filteredTickets.length})
              </h3>

              {loading && tickets.length === 0 ? (
                <Card className="p-6 text-center">
                  <Loader2 size={24} className="mx-auto text-muted-foreground animate-spin" />
                  <p className="text-muted-foreground mt-2">Loading...</p>
                </Card>
              ) : filteredTickets.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-muted-foreground">No tickets found</p>
                </Card>
              ) : (
                filteredTickets.map((ticket) => (
                  <Card
                    key={ticket.id}
                    className={`p-4 cursor-pointer transition-all hover:bg-white/10 ${
                      selectedTicket?.id === ticket.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => handleSelectTicket(ticket)}
                  >
                    <div className="flex items-start gap-3">
                      {getStatusIcon(ticket.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground mt-1">{ticket.user_name}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge
                            className={getPriorityColor(ticket.priority)}
                            variant="outline"
                          >
                            {ticket.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {ticket.status === 'open' && 'Open'}
                            {ticket.status === 'in_progress' && 'In Progress'}
                            {ticket.status === 'resolved' && 'Resolved'}
                          </Badge>
                        </div>
                        {ticket.replies && ticket.replies.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {ticket.replies.length} reply{ticket.replies.length !== 1 ? 'ies' : 'y'}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>

            {/* Ticket Details */}
            {loadingDetail && (
              <Card className="lg:col-span-2 flex items-center justify-center p-12">
                <div className="text-center">
                  <Loader2 size={32} className="mx-auto text-muted-foreground animate-spin" />
                  <p className="text-muted-foreground mt-2">Loading ticket details...</p>
                </div>
              </Card>
            )}
            {selectedTicket && !loadingDetail ? (
              <Card className="lg:col-span-2">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedTicket.subject}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Ticket ID: <span className="font-mono">{selectedTicket.token}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyToken(selectedTicket.token)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Copy token"
                    >
                      <Copy size={18} />
                    </button>
                  </div>

                  {/* User Info */}
                  <div className="pb-6 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-2">From</p>
                    <p className="font-medium">{selectedTicket.user_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {selectedTicket.created_at.toLocaleDateString()}
                    </p>
                  </div>

                  {/* Status & Priority */}
                  <div className="py-6 border-b border-border flex gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Status</p>
                      <Badge
                        variant={
                          selectedTicket.status === 'resolved'
                            ? 'default'
                            : selectedTicket.status === 'in_progress'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {selectedTicket.status === 'open' && 'Open'}
                        {selectedTicket.status === 'in_progress' && 'In Progress'}
                        {selectedTicket.status === 'resolved' && 'Resolved'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Priority</p>
                      <Badge className={getPriorityColor(selectedTicket.priority)} variant="outline">
                        {selectedTicket.priority}
                      </Badge>
                    </div>
                  </div>

                  {/* Conversation Thread */}
                  <div className="py-6 border-b border-border space-y-4">
                    {/* Original Message */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                        {selectedTicket.user_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{selectedTicket.user_name}</span> • {selectedTicket.created_at.toLocaleString()}
                        </p>
                        <p className="text-sm mt-1 leading-relaxed">{selectedTicket.message}</p>
                      </div>
                    </div>

                    {/* Replies */}
                    {selectedTicket.replies && selectedTicket.replies.map((reply) => (
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
                              {reply.is_admin ? 'You (Admin)' : reply.user_name}
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

                  {/* Response Form */}
                  {selectedTicket.status !== 'resolved' && (
                    <div className="mt-6">
                      <label className="block text-sm font-medium mb-2">Send Reply</label>
                      <textarea
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-3 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors resize-none"
                        placeholder="Type your reply..."
                      />
                      {error && (
                        <p className="text-xs text-red-400 mt-1">{error}</p>
                      )}
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={handleRespond}
                          disabled={!response.trim() || sending}
                          className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                          {sending ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                          Send Reply
                        </button>
                        <button
                          onClick={() => handleResolve(selectedTicket.id)}
                          disabled={resolving}
                          className="flex-1 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                          {resolving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                          Mark Resolved
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
                </div>
              </Card>
            ) : !loadingDetail ? (
              <Card className="lg:col-span-2 flex items-center justify-center p-12">
                <div className="text-center">
                  <MessageCircle size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground">Select a ticket to view details</p>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </MainLayout>
    </AdminRoute>
  );
}
