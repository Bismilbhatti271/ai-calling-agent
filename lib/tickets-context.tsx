'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';

export interface Ticket {
  id: string;
  user_id: number;
  user_name: string;
  subject: string;
  message: string;
  token: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'high' | 'medium' | 'low';
  created_at: Date;
  updated_at: Date;
  replies: TicketReply[];
  response?: string;
  responded_at?: Date;
}

export interface TicketReply {
  id: number;
  user_id: number;
  user_name: string;
  message: string;
  is_admin: boolean;
  created_at: Date;
}

interface TicketsContextType {
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  addTicket: (ticket: Ticket) => Promise<void>;
  createTicket: (subject: string, message: string) => Promise<{ id: number; token: string }>;
  replyToTicket: (id: string, message: string) => Promise<TicketReply[]>;
  resolveTicket: (id: string) => Promise<void>;
  getTicket: (id: string) => Ticket | undefined;
  refreshTickets: () => Promise<void>;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

function mapTicket(t: any): Ticket {
  return {
    ...t,
    id: String(t.id),
    created_at: new Date(t.created_at || Date.now()),
    updated_at: new Date(t.updated_at || Date.now()),
    replies: (t.replies || []).map((r: any) => ({
      ...r,
      created_at: new Date(r.created_at || Date.now()),
    })),
  };
}

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const refreshTickets = useCallback(async () => {
    try {
      const data = await api.tickets.list();
      setTickets(data.map(mapTicket));
      setError(null);
    } catch (err: any) {
      // Don't set error on auth failures during polling
      if (err.message?.includes('401')) {
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  // Poll every 5 seconds for real-time updates
  useEffect(() => {
    pollingRef.current = setInterval(refreshTickets, 5000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [refreshTickets]);

  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    // Optimistic update
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );

    // Send to backend
    const body: any = {};
    if (updates.status) body.status = updates.status;
    if (updates.priority) body.priority = updates.priority;
    if (Object.keys(body).length > 0) {
      try {
        await api.tickets.update(parseInt(id), body);
        await refreshTickets();
      } catch (err: any) {
        await refreshTickets(); // Revert on error
        throw err;
      }
    }
  }, [refreshTickets]);

  const addTicket = useCallback(async (ticket: Ticket) => {
    setTickets((prev) => [...prev, ticket]);
  }, []);

  const createTicket = useCallback(async (subject: string, message: string) => {
    const result = await api.tickets.create({ subject, message });
    await refreshTickets();
    return { id: result.id, token: result.token };
  }, [refreshTickets]);

  const replyToTicket = useCallback(async (id: string, message: string) => {
    const result = await api.tickets.reply(parseInt(id), { message });
    await refreshTickets();
    return result.replies.map((r: any) => ({
      ...r,
      created_at: new Date(r.created_at || Date.now()),
    }));
  }, [refreshTickets]);

  const resolveTicket = useCallback(async (id: string) => {
    await api.tickets.update(parseInt(id), { status: 'resolved' });
    await refreshTickets();
  }, [refreshTickets]);

  const getTicket = useCallback((id: string) => {
    return tickets.find((t) => t.id === id);
  }, [tickets]);

  return (
    <TicketsContext.Provider value={{
      tickets,
      loading,
      error,
      updateTicket,
      addTicket,
      createTicket,
      replyToTicket,
      resolveTicket,
      getTicket,
      refreshTickets,
    }}>
      {children}
    </TicketsContext.Provider>
  );
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketsProvider');
  }
  return context;
}
