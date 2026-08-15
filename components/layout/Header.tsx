'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Clock, Search, LogOut, Loader2 } from 'lucide-react';
import { NotificationCenter } from '@/components/common/NotificationCenter';
import { api } from '@/lib/api';

interface HeaderProps {
  title: string;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
  }>;
}

export function Header({ title, breadcrumbs }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [time, setTime] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [campaigns, agents] = await Promise.all([
          api.campaigns.list(),
          api.agents.list(),
        ]);

        const q = searchQuery.toLowerCase();
        const results = [
          ...campaigns
            .filter((c: any) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
            .map((c: any) => ({ type: 'campaign', label: c.name, href: `/campaigns/${c.id}`, icon: '📊' })),
          ...agents
            .filter((a: any) => a.name.toLowerCase().includes(q))
            .map((a: any) => ({ type: 'agent', label: a.name, href: `/agents/${a.id}`, icon: '🤖' })),
        ].slice(0, 8);

        setSearchResults(results);
        setShowResults(results.length > 0);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setShowResults(false);
      router.push(`/campaigns?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
    if (e.key === 'Escape') {
      setShowResults(false);
      searchInputRef.current?.blur();
    }
  };

  const handleResultClick = (href: string) => {
    setShowResults(false);
    setSearchQuery('');
    router.push(href);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Register keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="fixed top-0 left-64 right-0 h-16 glass-dark border-b border-white/10 backdrop-blur-md z-40">
      <div className="h-full px-8 flex items-center justify-between">
        {/* Title and Breadcrumbs */}
        <div className="flex items-center gap-4">
          <div>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                {breadcrumbs.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {index > 0 && <span className="text-gray-600">/</span>}
                    <span className={index === breadcrumbs.length - 1 ? 'text-white' : 'hover:text-gray-300'}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          {/* Search Bar */}
          <div className="relative hidden lg:block" ref={searchRef}>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2 hover:bg-white/10 transition-all-smooth">
              {searching ? (
                <Loader2 size={18} className="text-gray-500 animate-spin" />
              ) : (
                <Search size={18} className="text-gray-500" />
              )}
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim() && setShowResults(true)}
                onKeyDown={handleSearchKeyDown}
                className="bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none w-48"
              />
            </div>

            {/* Search Results Dropdown */}
            {showResults && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-border rounded-lg shadow-2xl overflow-hidden z-50">
                <div className="p-2">
                  {searchResults.map((result, i) => (
                    <button
                      key={`${result.type}-${i}`}
                      onClick={() => handleResultClick(result.href)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-lg transition-colors text-left"
                    >
                      <span className="text-lg">{result.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{result.label}</p>
                        <p className="text-xs text-gray-500 capitalize">{result.type}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-border">
                  <p className="text-xs text-gray-500 text-center">
                    Press Enter to search all campaigns
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {isMounted && (
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 px-3 py-2">
                <Clock size={16} />
                <span>{time || '00:00'}</span>
              </div>
            )}

            {/* Notifications */}
            <NotificationCenter />

            {/* User Info */}
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{user?.role === 'admin' ? 'Admin' : 'Active'}</p>
              </div>
              <img
                src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
                alt={user?.name}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600"
              />
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 rounded-lg text-sm text-red-400 hover:text-red-300 transition-all-smooth"
              title="Sign out"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
