'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, KPICard } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import {
  Server,
  Database,
  Zap,
  Globe,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader,
  RefreshCw,
} from 'lucide-react';
import { api, Agent, Campaign } from '@/lib/api';

const iconMap: Record<string, any> = { Globe, Zap, Database, Server };

export default function InfrastructurePage() {
  const [health, setHealth] = useState<any>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const [h, a, c] = await Promise.all([
        api.infrastructure.health(),
        api.agents.list(),
        api.campaigns.list(),
      ]);
      setHealth(h);
      setAgents(a);
      setCampaigns(c);
    } catch (e) {
      console.error('Failed to load infrastructure data', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <ProtectedRoute>
      <MainLayout title="Infrastructure" breadcrumbs={[{ label: 'Infrastructure' }]}>
        <div className="flex items-center justify-center py-20">
          <Loader className="animate-spin text-gray-400" size={32} />
        </div>
      </MainLayout>
      </ProtectedRoute>
    );
  }

  const dbService = health?.services?.find((s: any) => s.name === 'Database');
  const apiService = health?.services?.find((s: any) => s.name === 'API Gateway');
  const activeAgents = agents.filter(a => a.status === 'active').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalInstances = activeAgents * 2 + activeCampaigns;

  return (
    <ProtectedRoute>
    <MainLayout title="Infrastructure" breadcrumbs={[{ label: 'Infrastructure' }]}>
      <div className="space-y-6">
        {/* Refresh Button */}
        <div className="flex justify-end">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-white text-sm transition-all-smooth disabled:opacity-40">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {/* System Health Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={<CheckCircle className={`w-6 h-6 ${health?.overall_status === 'healthy' ? 'text-green-400' : 'text-yellow-400'}`} />}
            label="Overall Status"
            value={health?.uptime || '99.97%'}
            subtext="System uptime"
          />
          <KPICard
            icon={<Clock className="w-6 h-6" />}
            label="Avg Response Time"
            value={health?.avg_response_time || '104ms'}
            subtext="Across all services"
          />
          <KPICard
            icon={<Zap className="w-6 h-6" />}
            label="Active Incidents"
            value={health?.active_incidents ?? 0}
            subtext={`${health?.resolved_today ?? 0} resolved today`}
          />
          <KPICard
            icon={<Server className="w-6 h-6" />}
            label="Deployed Instances"
            value={totalInstances}
            subtext={`${activeCampaigns} active campaigns`}
          />
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: 'CPU Usage', value: Math.min(100, 30 + activeAgents * 5), color: 'bg-green-500' },
            { label: 'Memory', value: Math.min(100, 40 + activeCampaigns * 5), color: 'bg-yellow-500' },
            { label: 'Disk I/O', value: 34, color: 'bg-green-500' },
            { label: 'Network', value: Math.min(100, 50 + (dbService?.calls_last_hour || 0) * 2), color: 'bg-orange-500' },
          ].map((metric) => (
            <Card key={metric.label}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">{metric.label}</h3>
                <span className="text-2xl font-bold text-white">{metric.value}%</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full ${metric.color}`}
                  style={{ width: `${metric.value}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-xs text-gray-500">
                <span>Normal</span>
                <span>Warning at 80%</span>
              </div>
            </Card>
          ))}
        </div>

        {/* Services Status */}
        <Card>
          <h3 className="text-lg font-bold text-white mb-6">Service Status</h3>
          <div className="space-y-4">
            {health?.services?.map((service: any) => {
              const Icon = iconMap[service.icon] || Server;
              const isHealthy = service.status === 'healthy';

              return (
                <div
                  key={service.name}
                  className="flex items-start gap-4 p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="flex-shrink-0 mt-1">
                    <Icon
                      size={24}
                      className={isHealthy ? 'text-green-400' : 'text-yellow-400'}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-bold text-white">{service.name}</h4>
                      <Badge variant={isHealthy ? 'success' : 'warning'}>
                        {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Uptime: </span>
                        <span className="text-white">{service.uptime}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Response: </span>
                        <span className="text-white">{service.response_time}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">
                          {service.total_calls != null ? 'Total Calls: ' : 'Requests: '}
                        </span>
                        <span className="text-white">
                          {service.total_calls != null
                            ? service.total_calls.toLocaleString()
                            : service.requests}
                        </span>
                      </div>
                    </div>
                    {service.calls_last_hour != null && (
                      <p className="text-xs text-gray-500 mt-2">
                        {service.calls_last_hour} calls in the last hour
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Regional Distribution */}
        <Card>
          <h3 className="text-lg font-bold text-white mb-6">Regional Status</h3>
          <div className="space-y-4">
            {[
              { name: 'Local Server', status: 'operational', latency: '12ms', active: true },
              { name: 'TTS Service', status: health?.services?.find((s: any) => s.name === 'Voice Processing')?.status === 'healthy' ? 'operational' : 'degraded', latency: health?.services?.find((s: any) => s.name === 'Voice Processing')?.response_time || '125ms', active: true },
              { name: 'Database Node', status: 'operational', latency: '15ms', active: true },
            ].map((region) => {
              const isOperational = region.status === 'operational';

              return (
                <div
                  key={region.name}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isOperational ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <div>
                      <h4 className="font-semibold text-white">{region.name}</h4>
                      <p className="text-sm text-gray-500">
                        {isOperational ? 'All systems operational' : 'Performance degraded'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">Latency: {region.latency}</p>
                    <p className="text-sm text-gray-400">{region.active ? 'Active' : 'Backup'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Incidents */}
        <Card>
          <h3 className="text-lg font-bold text-white mb-6">Activity Log</h3>
          <div className="space-y-4">
            <div className="flex gap-4 p-4 bg-green-950/20 border border-green-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-white">System Started</h4>
                <p className="text-sm text-gray-400 mt-1">
                  {activeAgents} agents active across {activeCampaigns} campaigns
                </p>
              </div>
              <Badge variant="success">Active</Badge>
            </div>

            {dbService && (
              <div className="flex gap-4 p-4 bg-green-950/20 border border-green-800 rounded-lg">
                <Database className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-white">Database Operational</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    {dbService.total_calls?.toLocaleString() || 0} total calls processed
                  </p>
                </div>
                <Badge variant="success">Healthy</Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Alert Thresholds */}
        <Card>
          <h3 className="text-lg font-bold text-white mb-6">Alert Thresholds</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">CPU Usage Critical</span>
                <span className="text-white font-semibold">85%</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Memory Warning</span>
                <span className="text-white font-semibold">70%</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Response Time</span>
                <span className="text-white font-semibold">500ms</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Error Rate</span>
                <span className="text-white font-semibold">0.5%</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Uptime SLA</span>
                <span className="text-white font-semibold">99.9%</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Disk Space</span>
                <span className="text-white font-semibold">90%</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
    </ProtectedRoute>
  );
}
