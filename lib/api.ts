const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002/api';

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('empirex_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setToken(token: string) {
  localStorage.setItem('empirex_token', token);
}

export function clearToken() {
  localStorage.removeItem('empirex_token');
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('empirex_token');
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options?.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${API_BASE}${url}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface KnowledgeDocument {
  id: number;
  campaign_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: number;
  name: string;
  description: string;
  agent_id: number;
  agent_name?: string;
  status: string;
  target_count: number;
  completed_count: number;
  conversion_count: number;
  daily_target: number;
  daily_completed: number;
  created_at: string;
}

export interface Agent {
  id: number;
  name: string;
  description: string;
  model: string;
  voice_type: string;
  status: string;
  total_calls: number;
  calls_today: number;
  conversion_rate: number;
  real_total_calls: number;
  real_calls_today: number;
  real_conversions: number;
  real_conversions_today: number;
  real_conversion_rate: number;
}

export interface CallRecord {
  id: number;
  campaign_id: number;
  agent_id: number;
  agent_name?: string;
  phone_number: string;
  customer_name: string;
  status: string;
  result: string;
  duration_seconds: number;
  age_collected: number | null;
  outcome_text: string | null;
  created_at: string;
}

export interface DashboardKPIs {
  total_calls_today: number;
  calls_comparison: number;
  total_conversions_today: number;
  conversion_rate_today: number;
  conversion_comparison: number;
  active_agents: number;
  active_campaigns: number;
  total_revenue: number;
  average_call_duration: number;
  total_calls_all_time: number;
}

export interface CallsByDay {
  date: string;
  count: number;
  conversions: number;
  conversion_rate: number;
}

export interface Lead {
  id: number;
  campaign_id: number;
  phone_number: string;
  first_name: string;
  last_name: string;
  status: string;
  call_result: string | null;
  age_collected: number | null;
  notes: string | null;
  created_at: string;
  called_at: string | null;
  disposition?: string;
  campaign_name?: string;
  agent_name?: string;
  agent_id?: number;
}

export interface UserSession {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  phone: string;
  avatar: string;
  about: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: UserSession;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  phone: string;
  avatar: string;
  about: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface DialerStatus {
  active: boolean;
  completed: number;
  total: number;
  pending: number;
  called: number;
  conversions: number;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface ActivitySummary {
  by_user: { user_id: number; user_name: string; actions: number; last_active: string }[];
  by_action: { action: string; count: number }[];
  total_today: number;
  period_days: number;
}

export const api = {
  campaigns: {
    list: () => fetchJSON<Campaign[]>('/campaigns'),
    get: (id: number) => fetchJSON<Campaign>(`/campaigns/${id}`),
    create: (data: Partial<Campaign>) =>
      fetchJSON<{ id: number }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<Campaign>) =>
      fetchJSON<void>(`/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      fetchJSON<void>(`/campaigns/${id}`, { method: 'DELETE' }),
    start: (id: number) =>
      fetchJSON<void>(`/campaigns/${id}/start`, { method: 'POST' }),
    pause: (id: number) =>
      fetchJSON<void>(`/campaigns/${id}/pause`, { method: 'POST' }),
    complete: (id: number) =>
      fetchJSON<void>(`/campaigns/${id}/complete`, { method: 'POST' }),
  },
  agents: {
    list: () => fetchJSON<Agent[]>('/agents'),
    get: (id: number) => fetchJSON<Agent>(`/agents/${id}`),
    calls: (id: number, limit = 20) =>
      fetchJSON<any[]>(`/agents/${id}/calls?limit=${limit}`),
    stats: (id: number) =>
      fetchJSON<{ total_calls: number; calls_today: number; conversions: number; transfers: number; declined: number; by_campaign: { name: string; calls: number; convs: number }[] }>(`/agents/${id}/stats`),
    create: (data: { name: string; description?: string; model?: string; voice_type?: string }) =>
      fetchJSON<{ id: number }>('/agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Agent>) =>
      fetchJSON<void>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJSON<void>(`/agents/${id}`, { method: 'DELETE' }),
  },
  calls: {
    list: (campaignId?: number) =>
      fetchJSON<CallRecord[]>(
        campaignId ? `/calls?campaign_id=${campaignId}` : '/calls'
      ),
    get: (id: number) =>
      fetchJSON<CallRecord>(`/calls/${id}`),
    recent: (limit = 10) =>
      fetchJSON<CallRecord[]>(`/calls/recent?limit=${limit}`),
    exportCSV: async (campaignId?: number) => {
      const params = campaignId ? `?campaign_id=${campaignId}` : '';
      const token = localStorage.getItem('empirex_token');
      const res = await fetch(`${API_BASE}/calls/export-csv${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calls_export_${campaignId || 'all'}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  leads: {
    list: (campaignId?: number, status?: string) => {
      let url = '/leads?';
      if (campaignId) url += `campaign_id=${campaignId}&`;
      if (status) url += `status=${status}&`;
      return fetchJSON<Lead[]>(url);
    },
    queue: (campaignId: number) =>
      fetchJSON<Lead[]>(`/leads/queue?campaign_id=${campaignId}`),
    create: (data: { campaign_id: number; phone_number: string; first_name?: string; last_name?: string }) =>
      fetchJSON<{ id: number }>('/leads', { method: 'POST', body: JSON.stringify(data) }),
    importBatch: (campaignId: number, leads: { phone_number: string; first_name?: string; last_name?: string }[]) =>
      fetchJSON<{ imported: number }>('/leads/import', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId, leads }),
      }),
    delete: (id: number) =>
      fetchJSON<void>(`/leads/${id}`, { method: 'DELETE' }),
    dial: (campaignId: number) =>
      fetchJSON<{ message: string }>(`/leads/dial/${campaignId}`, { method: 'POST' }),
    stop: (campaignId: number) =>
      fetchJSON<{ message: string }>(`/leads/stop/${campaignId}`, { method: 'POST' }),
    dialerStatus: (campaignId: number) =>
      fetchJSON<DialerStatus>(`/leads/dialer-status/${campaignId}`),
    exportCSV: async (campaignId?: number, status?: string) => {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaign_id', campaignId.toString());
      if (status) params.set('status', status);
      const token = localStorage.getItem('empirex_token');
      const res = await fetch(`${API_BASE}/leads/export-csv?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_export_${campaignId || 'all'}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  calling: {
    start: (data: { campaign_id: number; agent_id: number; phone_number: string; customer_name?: string; lead_id?: number }) =>
      fetchJSON<{ call_id: number; message: string }>('/calling/start-call', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    recall: (leadId: number) =>
      fetchJSON<{ call_id: number; lead_id: number; message: string }>(`/calling/recall/${leadId}`, {
        method: 'POST',
      }),
    status: (callId: number) =>
      fetchJSON<{ id: number; status: string; result: string }>(`/calling/status/${callId}`),
    activeCalls: () =>
      fetchJSON<{ status: string; call_id: number }[]>('/calling/active-calls'),
    startChat: (data: { campaign_id: number; agent_id: number; phone_number: string; customer_name?: string; lead_id?: number }) =>
      fetchJSON<{ session_id: number; call_id: number; agent_name: string; pitch: string; message: string }>('/calling/start-chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    startVoiceChat: (data: { campaign_id: number; agent_id: number; phone_number: string; customer_name?: string; lead_id?: number }) =>
      fetchJSON<{ session_id: number; call_id: number; agent_name: string; pitch: string; message: string }>('/calling/start-voice-chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getTranscript: (sessionId: number, sinceIndex: number = 0) =>
      fetchJSON<{ lines: string[]; total_lines: number; since_index: number; call_ended: boolean; session: any }>(`/calling/transcript/${sessionId}?since_index=${sinceIndex}`),
    sendMessage: (data: { session_id: number; message: string; campaign_id: number; agent_id: number; phone_number?: string; customer_name?: string; lead_id?: number; call_id?: number }) =>
      fetchJSON<{ reply: string; call_ended: boolean; transcript: string }>('/calling/send-message', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Transfer endpoints
    pendingTransfers: () =>
      fetchJSON<{ session_id: number; customer_name: string; status: string; created_at: number; call_id: number; campaign_id: number }[]>('/calling/pending-transfers'),
    acceptTransfer: (sessionId: number) =>
      fetchJSON<{ message: string; session_id: number; customer_name: string }>('/calling/accept-transfer', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      }),
    declineTransfer: (sessionId: number) =>
      fetchJSON<{ message: string; session_id: number }>('/calling/decline-transfer', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      }),
    completeTransfer: (sessionId: number) =>
      fetchJSON<{ message: string; session_id: number }>('/calling/complete-transfer', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      }),
    sendHumanMessage: (data: { session_id: number; message: string; campaign_id: number; agent_id: number; phone_number?: string; customer_name?: string; lead_id?: number; call_id?: number }) =>
      fetchJSON<{ reply: string; call_ended: boolean; transcript: string | null; is_human: boolean }>('/calling/send-human-message', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    stopCall: (data: { session_id?: number; call_id?: number; lead_id?: number; campaign_id?: number }) =>
      fetchJSON<{ message: string; call_ended: boolean; transcript: string }>('/calling/stop-call', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  usage: {
    get: (days = 30) =>
      fetchJSON<{ daily: { date: string; api_calls: number; cost: number }[]; summary: { today_calls: number; total_calls: number; quota: number; usage_percentage: number; total_cost: number } }>(`/dashboard/usage?days=${days}`),
  },
  infrastructure: {
    health: () =>
      fetchJSON<{
        overall_status: string;
        uptime: string;
        avg_response_time: string;
        active_incidents: number;
        resolved_today: number;
        services: { name: string; status: string; uptime: string; response_time: string; requests?: string; total_calls?: number; calls_last_hour?: number; icon: string }[];
      }>('/infrastructure/health'),
  },
  auth: {
    login: (email: string, password: string) =>
      fetchJSON<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => fetchJSON<UserSession>('/auth/me'),
    updateProfile: (data: { name?: string; email?: string; phone?: string; about?: string; avatar?: string }) =>
      fetchJSON<UserSession>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    changePassword: (oldPassword: string, newPassword: string) =>
      fetchJSON<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      }),
  },
  users: {
    list: () => fetchJSON<AdminUser[]>('/users'),
    get: (id: number) => fetchJSON<AdminUser>(`/users/${id}`),
    create: (data: { email: string; password: string; name: string; role?: string; phone?: string }) =>
      fetchJSON<{ id: number; message: string }>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name?: string; email?: string; password?: string; role?: string; phone?: string; status?: string }) =>
      fetchJSON<{ message: string }>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      fetchJSON<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),
    activity: (limit = 50, userId?: number, action?: string) => {
      let url = `/users/activity-log?limit=${limit}`;
      if (userId) url += `&user_id=${userId}`;
      if (action) url += `&action=${encodeURIComponent(action)}`;
      return fetchJSON<ActivityLog[]>(url);
    },
    activitySummary: (days = 7) =>
      fetchJSON<ActivitySummary>(`/users/activity-log/summary?days=${days}`),
  },
  notifications: {
    list: (sinceId = 0) =>
      fetchJSON<{ id: number; type: string; title: string; message: string; is_read: number; created_at: string }[]>(`/notifications?since_id=${sinceId}`),
    unreadCount: () =>
      fetchJSON<{ count: number }>('/notifications/unread-count'),
    markRead: (id: number) =>
      fetchJSON<{ message: string }>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () =>
      fetchJSON<{ message: string }>('/notifications/read-all', { method: 'POST' }),
  },
  tickets: {
    list: () =>
      fetchJSON<{
        id: number;
        user_id: number;
        user_name: string;
        subject: string;
        message: string;
        token: string;
        status: 'open' | 'in_progress' | 'resolved';
        priority: 'high' | 'medium' | 'low';
        created_at: string;
        updated_at: string;
      }[]>('/tickets'),
    get: (id: number) =>
      fetchJSON<{
        id: number;
        user_id: number;
        user_name: string;
        subject: string;
        message: string;
        token: string;
        status: 'open' | 'in_progress' | 'resolved';
        priority: 'high' | 'medium' | 'low';
        created_at: string;
        updated_at: string;
        replies: {
          id: number;
          user_id: number;
          user_name: string;
          message: string;
          is_admin: boolean;
          created_at: string;
        }[];
      }>(`/tickets/${id}`),
    create: (data: { subject: string; message: string }) =>
      fetchJSON<{ id: number; token: string; message: string }>('/tickets', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reply: (id: number, data: { message: string }) =>
      fetchJSON<{
        message: string;
        replies: {
          id: number;
          user_id: number;
          user_name: string;
          message: string;
          is_admin: boolean;
          created_at: string;
        }[];
      }>(`/tickets/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { status?: string; priority?: string }) =>
      fetchJSON<{
        id: number;
        user_id: number;
        user_name: string;
        subject: string;
        message: string;
        token: string;
        status: string;
        priority: string;
        created_at: string;
        updated_at: string;
      }>(`/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  // VICIdial integration
  vicidial: {
    status: () =>
      fetchJSON<{
        connected: boolean;
        api_url: string;
        campaign_id: string;
        agent_user: string;
        last_check: number;
        active_sessions: number;
        agent_status: any;
      }>('/vicidial/status'),
    config: {
      get: () => fetchJSON<any>('/vicidial/config'),
      update: (data: any) =>
        fetchJSON<any>('/vicidial/config', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      test: () =>
        fetchJSON<{ api_ok: boolean; agent_ok: boolean; campaign_ok: boolean }>('/vicidial/config/test', {
          method: 'POST',
        }),
    },
    agent: {
      login: () =>
        fetchJSON<{ message: string }>('/vicidial/agent/login', { method: 'POST' }),
      logout: () =>
        fetchJSON<{ message: string }>('/vicidial/agent/logout', { method: 'POST' }),
      status: () => fetchJSON<any>('/vicidial/agent/status'),
    },
    campaign: {
      start: () =>
        fetchJSON<{ message: string }>('/vicidial/campaign/start', { method: 'POST' }),
      stop: () =>
        fetchJSON<{ message: string }>('/vicidial/campaign/stop', { method: 'POST' }),
      status: () => fetchJSON<any>('/vicidial/campaign/status'),
    },
    leads: {
      list: (campaignId?: string, status?: string) => {
        let url = '/vicidial/leads?';
        if (campaignId) url += `campaign_id=${campaignId}&`;
        if (status) url += `status=${status}&`;
        return fetchJSON<{ leads: any[]; count: number }>(url);
      },
      syncToVICIdial: (campaignId: string | undefined, leads: { phone_number: string; first_name?: string; last_name?: string }[]) =>
        fetchJSON<{ imported: number; failed: number; errors: string[] }>('/vicidial/sync-leads-to-vicidial', {
          method: 'POST',
          body: JSON.stringify({ campaign_id: campaignId, leads }),
        }),
    },
    sessions: {
      list: () =>
        fetchJSON<{ active_sessions: number; sessions: any[] }>('/vicidial/sessions'),
      get: (callId: string) => fetchJSON<any>(`/vicidial/sessions/${callId}`),
    },
    transfer: (callId: string, destination?: string) =>
      fetchJSON<any>(`/vicidial/transfer/${callId}?destination=${destination || ''}`, {
        method: 'POST',
      }),
    dialplanConfig: () => fetchJSON<{ config: string; instructions: string }>('/vicidial/dialplan-config'),
  },
  dashboard: {
    kpis: () => fetchJSON<DashboardKPIs>('/dashboard/kpis'),
    callsByDay: (days = 7) =>
      fetchJSON<CallsByDay[]>(`/dashboard/calls-by-day?days=${days}`),
    analytics: (days = 30) =>
      fetchJSON<{ date: string; calls_completed: number; calls_failed: number; conversions: number; avg_duration: number; conversion_rate: number }[]>(`/dashboard/analytics?days=${days}`),
  },

  // Knowledge Base
  knowledgeBase: {
    list: (campaignId: number) =>
      fetchJSON<KnowledgeDocument[]>(`/knowledge-base/campaign/${campaignId}`),
    get: (id: number) =>
      fetchJSON<KnowledgeDocument>(`/knowledge-base/${id}`),
    create: (body: { campaign_id: number; title: string; content: string }) =>
      fetchJSON<{ id: number; message: string }>('/knowledge-base', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: { title?: string; content?: string }) =>
      fetchJSON<{ message: string }>(`/knowledge-base/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) =>
      fetchJSON<{ message: string }>(`/knowledge-base/${id}`, { method: 'DELETE' }),
    search: (campaignId: number, query: string) =>
      fetchJSON<KnowledgeDocument[]>(`/knowledge-base/search/${campaignId}?query=${encodeURIComponent(query)}`),
  },
};
