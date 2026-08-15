'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  Activity,
  BarChart3,
  Gauge,
  Network,
  Phone,
  PhoneCall,
  BookOpen,
  Zap,
  LogOut,
  Settings,
  Shield,
  Users,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { APiQuotaWidget } from '@/components/common/APiQuotaWidget';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Main menu items - same for all authenticated users (except Agents which is admin-only)
  const mainMenuItems = [
    {
      label: 'Dashboard',
      href: '/',
      icon: Gauge,
    },
    {
      label: 'Campaigns',
      href: '/campaigns',
      icon: Phone,
    },
    {
      label: 'Outbound',
      href: '/outbound',
      icon: PhoneCall,
    },
    {
      label: 'Analytics',
      href: '/analytics',
      icon: BarChart3,
    },
    {
      label: 'Performance',
      href: '/analytics/performance',
      icon: Zap,
    },
    {
      label: 'API Usage',
      href: '/api-usage',
      icon: Network,
    },
    {
      label: 'Infrastructure',
      href: '/infrastructure',
      icon: Gauge,
    },
    {
      label: 'VICIdial',
      href: '/vicidial',
      icon: PhoneCall,
    },
    {
      label: 'Knowledge Base',
      href: '/knowledge-base',
      icon: BookOpen,
    },
  ];

  // AI Agents - admin only
  const adminAgentItem = {
    label: 'AI Agents',
    href: '/agents',
    icon: Activity,
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 glass-dark border-r border-white/10 flex flex-col transition-all-smooth">
      {/* Logo Section */}
      <div className="p-6 border-b border-white/10 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tighter text-white">
          Empire<span className="text-gray-400">-X</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">AI Calling Platform</p>
      </div>

      {/* Menu Items - Scrollable */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {mainMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all-smooth group ${
                  isActive
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon
                  size={20}
                  className={`transition-all-smooth ${
                    isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-inherit'
                  }`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div className="ml-auto w-1 h-6 bg-white rounded-full" />
                )}
              </Link>
            );
          })}

          {/* AI Agents - Admin Only */}
          {user?.role === 'admin' && (
            (() => {
              const Icon = adminAgentItem.icon;
              const isActive = pathname === adminAgentItem.href;
              return (
                <Link
                  key={adminAgentItem.href}
                  href={adminAgentItem.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all-smooth group ${
                    isActive
                      ? 'bg-white/10 text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon
                    size={20}
                    className={`transition-all-smooth ${
                      isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      isActive ? 'text-white' : 'text-inherit'
                    }`}
                  >
                    {adminAgentItem.label}
                  </span>
                  {isActive && (
                    <div className="ml-auto w-1 h-6 bg-white rounded-full" />
                  )}
                </Link>
              );
            })()
          )}
        </div>

        {/* Support Tickets Section (for all users) */}
        <Link
          href="/tickets"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all-smooth mt-4 group ${
            pathname === '/tickets'
              ? 'bg-white/10 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare size={20} className="text-gray-500 group-hover:text-white" />
          <span className="text-sm font-medium">Support Tickets</span>
        </Link>

        {/* Admin Section */}
        {user?.role === 'admin' && (
          <>
            <div className="my-4 px-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <Shield size={12} />
                Admin
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'User Management', href: '/admin/users', icon: Users },
                { label: 'Support Tickets', href: '/admin/tickets', icon: MessageSquare },
                { label: 'Activity Log', href: '/admin/activity', icon: BarChart3 },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all-smooth group ${
                      isActive
                        ? 'bg-white/10 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon
                      size={20}
                      className={`transition-all-smooth ${
                        isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'
                      }`}
                    />
                    <span
                      className={`text-sm font-medium ${
                        isActive ? 'text-white' : 'text-inherit'
                      }`}
                    >
                      {item.label}
                    </span>
                    {isActive && (
                      <div className="ml-auto w-1 h-6 bg-white rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Settings */}
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all-smooth mt-4 group ${
            pathname === '/settings'
              ? 'bg-white/10 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings size={20} className="text-gray-500 group-hover:text-white" />
          <span className="text-sm font-medium">Settings</span>
        </Link>
      </nav>

      {/* Footer Section */}
      <div className="flex-shrink-0 p-4 border-t border-white/10 bg-gradient-to-t from-black/20 to-transparent space-y-3">
        {/* User Info */}
        <div className="p-3 glass rounded-lg cursor-pointer hover:bg-white/10 transition-all" onClick={() => setUserMenuOpen(!userMenuOpen)}>
          <div className="flex items-center gap-3">
            <img 
              src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'} 
              alt={user?.name}
              className="w-8 h-8 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* User Menu Dropdown */}
        {userMenuOpen && (
          <div className="glass rounded-lg p-2 space-y-1">
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <Settings size={14} />
              Profile Settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-left"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        )}

        {/* API Quota */}
        <APiQuotaWidget />
      </div>
    </aside>
  );
}
