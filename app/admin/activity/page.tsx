'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { api, ActivityLog, ActivitySummary, AdminUser } from '@/lib/api';
import { RotateCw, Search, Filter, Users, Activity, Calendar, Clock } from 'lucide-react';

export default function AdminActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterAction, setFilterAction] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'summary'>('live');

  const fetchData = useCallback(async () => {
    try {
      const [logData, summaryData, userData] = await Promise.all([
        api.users.activity(100, filterUser ? parseInt(filterUser) : undefined, filterAction || undefined),
        api.users.activitySummary(7),
        api.users.list(),
      ]);
      setLogs(logData);
      setSummary(summaryData);
      setUsers(userData);
    } catch { }
    setLoading(false);
  }, [filterUser, filterAction]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (activeTab === 'live') {
        api.users.activity(100, filterUser ? parseInt(filterUser) : undefined, filterAction || undefined).then(setLogs).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData, activeTab, filterUser, filterAction]);

  const getActionColor = (action: string) => {
    if (action.includes('login')) return 'text-green-400';
    if (action.includes('delete') || action.includes('remove')) return 'text-red-400';
    if (action.includes('create') || action.includes('add')) return 'text-blue-400';
    if (action.includes('update') || action.includes('edit')) return 'text-yellow-400';
    if (action.includes('call') || action.includes('dial')) return 'text-purple-400';
    return 'text-gray-300';
  };

  return (
    <AdminRoute>
      <MainLayout title="Activity Log" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Activity' }]}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">User Activity Log</h1>
              <p className="text-muted-foreground mt-1">Monitor all user actions across the platform</p>
            </div>
            <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-sm font-medium transition-colors">
              <RotateCw size={16} /> Refresh
            </button>
          </div>

          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Activity size={20} className="text-blue-400" />
                  <div>
                    <p className="text-2xl font-bold">{summary.total_today}</p>
                    <p className="text-xs text-muted-foreground">Actions Today</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-green-400" />
                  <div>
                    <p className="text-2xl font-bold">{summary.by_user.length}</p>
                    <p className="text-xs text-muted-foreground">Active Users (7d)</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar size={20} className="text-purple-400" />
                  <div>
                    <p className="text-2xl font-bold">{summary.period_days}</p>
                    <p className="text-xs text-muted-foreground">Reporting Period</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-yellow-400" />
                  <div>
                    <p className="text-2xl font-bold">{summary.by_action.length}</p>
                    <p className="text-xs text-muted-foreground">Action Types</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('live')}
              className={`px-4 py-2 rounded-lg font-medium transition-all-smooth ${
                activeTab === 'live' ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
              }`}>
              Live Feed
            </button>
            <button onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 rounded-lg font-medium transition-all-smooth ${
                activeTab === 'summary' ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
              }`}>
              Summary View
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" placeholder="Filter by action type..."
                value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 text-sm" />
            </div>
            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 text-sm">
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>

          {loading ? (
            <Card className="text-center py-12">
              <RotateCw size={24} className="animate-spin text-gray-400 mx-auto" />
            </Card>
          ) : activeTab === 'live' ? (
            /* Live Feed */
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Time</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">User</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Action</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No activity recorded yet.</td></tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="border-b border-border hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{log.user_name}</span>
                            <span className="text-xs text-muted-foreground ml-2">(ID: {log.user_id})</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-mono text-xs ${getActionColor(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                            {log.details || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* Summary View */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h3 className="text-lg font-bold text-white mb-4">Activity by User</h3>
                {summary && summary.by_user.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No activity in the selected period.</p>
                ) : (
                  <div className="space-y-3">
                    {summary?.by_user.map((u, i) => (
                      <div key={u.user_id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                          <div>
                            <p className="text-sm font-medium">{u.user_name}</p>
                            <p className="text-xs text-muted-foreground">Last active: {new Date(u.last_active).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{u.actions}</p>
                          <p className="text-xs text-muted-foreground">actions</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h3 className="text-lg font-bold text-white mb-4">Activity by Action Type</h3>
                {summary && summary.by_action.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No activity in the selected period.</p>
                ) : (
                  <div className="space-y-3">
                    {summary?.by_action.map((a, i) => {
                      const total = summary?.by_action.reduce((sum, item) => sum + item.count, 0) || 1;
                      const pct = Math.round((a.count / total) * 100);
                      return (
                        <div key={a.action} className="p-3 bg-white/5 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-sm font-mono ${getActionColor(a.action)}`}>{a.action}</span>
                            <span className="text-sm font-bold">{a.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-gray-400 to-gray-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </MainLayout>
    </AdminRoute>
  );
}
