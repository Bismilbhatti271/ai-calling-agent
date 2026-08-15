'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTickets } from '@/lib/tickets-context';
import { ProtectedRoute, AdminRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { ArrowLeft, Send, MessageSquare, Calendar, User, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PageProps {
  params: {
    id: string;
  };
}

export default function TicketDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { getTicket, updateTicket } = useTickets();
  const ticket = getTicket(params.id);
  const [response, setResponse] = useState('');
  const [ticket_status, setTicketStatus] = useState(ticket?.status || 'open');

  if (!ticket) {
    return (
      <AdminRoute>
        <MainLayout
          title="Ticket Not Found"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Support Tickets', href: '/admin/tickets' },
          ]}
        >
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">This ticket does not exist</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go Back
            </button>
          </div>
        </MainLayout>
      </AdminRoute>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-500/10 text-blue-300 border border-blue-500/20';
      case 'in_progress':
        return 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20';
      case 'resolved':
        return 'bg-green-500/10 text-green-300 border border-green-500/20';
      default:
        return 'bg-gray-500/10 text-gray-300 border border-gray-500/20';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-400';
      case 'medium':
        return 'text-yellow-400';
      case 'low':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  const handleSendResponse = () => {
    if (response.trim() && ticket) {
      updateTicket(ticket.id, {
        response: response,
        responded_at: new Date(),
        status: 'in_progress',
      });
      setResponse('');
      setTicketStatus('in_progress');
    }
  };

  const handleResolve = () => {
    if (ticket) {
      updateTicket(ticket.id, { status: 'resolved' });
      setTicketStatus('resolved');
    }
  };

  return (
    <AdminRoute>
      <MainLayout
        title={ticket.subject}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Support Tickets', href: '/admin/tickets' },
          { label: ticket.subject },
        ]}
      >
        <div className="space-y-6 max-w-4xl">
          {/* Ticket Header */}
          <div className="flex items-start justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
            >
              <ArrowLeft size={18} />
              Back to Tickets
            </button>
          </div>

          {/* Ticket Info */}
          <Card>
            <div className="p-6">
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                {/* Status */}
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Status</p>
                  <div className={`inline-block px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(ticket_status)}`}>
                    {ticket_status.replace('_', ' ').charAt(0).toUpperCase() + ticket_status.slice(1)}
                  </div>
                </div>

                {/* Priority */}
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Priority</p>
                  <p className={`font-medium ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                  </p>
                </div>

                {/* Ticket ID */}
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Ticket ID</p>
                  <p className="font-mono text-sm text-white">{ticket.token}</p>
                </div>

                {/* Created */}
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Created</p>
                  <p className="text-sm text-gray-300">{new Date(ticket.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* User Info */}
              <div className="border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-white">{ticket.user_name}</p>
                    <p className="text-xs text-gray-400">User ID: {ticket.user_id}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Ticket Message */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Original Message</h3>
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-gray-300 mb-4">{ticket.message}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Calendar size={14} />
                  <span>{new Date(ticket.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Previous Response */}
          {ticket.response && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageSquare size={20} />
                  Admin Response
                </h3>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <p className="text-gray-300 mb-4">{ticket.response}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar size={14} />
                    <span>{ticket.responded_at ? new Date(ticket.responded_at).toLocaleString() : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Response Section */}
          {ticket_status !== 'resolved' && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Send Response</h3>
                <div className="space-y-4">
                  <textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Type your response to the user..."
                    rows={5}
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors resize-none text-white placeholder-gray-500"
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setResponse('')}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendResponse}
                      disabled={!response.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors font-medium text-white"
                    >
                      <Send size={16} />
                      Send Response
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Actions */}
          {ticket_status !== 'resolved' && (
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleResolve}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors font-medium text-white"
              >
                <CheckCircle2 size={18} />
                Mark as Resolved
              </button>
            </div>
          )}

          {ticket_status === 'resolved' && (
            <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-green-300 font-medium">This ticket has been resolved</span>
            </div>
          )}
        </div>
      </MainLayout>
    </AdminRoute>
  );
}
