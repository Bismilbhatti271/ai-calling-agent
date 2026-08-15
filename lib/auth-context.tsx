'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, UserSession, setToken, clearToken, getToken } from './api';

export type UserRole = 'admin' | 'user' | null;

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  avatar: string;
  about: string;
  created_at: Date;
  status: 'active' | 'inactive';
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toUser(session: UserSession): User {
  return {
    id: String(session.id),
    email: session.email,
    name: session.name,
    role: session.role,
    phone: session.phone,
    avatar: session.avatar,
    about: session.about,
    status: session.status,
    created_at: new Date(session.created_at),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const session = await api.auth.me();
      const u = toUser(session);
      setUser(u);
      setIsLoggedIn(true);
      localStorage.setItem('empirex_user', JSON.stringify(u));
    } catch {
      setUser(null);
      setIsLoggedIn(false);
      localStorage.removeItem('empirex_user');
      localStorage.removeItem('empirex_token');
    }
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('empirex_user');
    if (storedUser && getToken()) {
      refreshUser().finally(() => setIsHydrated(true));
    } else {
      setIsHydrated(true);
    }
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await api.auth.login(email, password);
      setToken(res.token);
      const u = toUser(res.user);
      setUser(u);
      setIsLoggedIn(true);
      localStorage.setItem('empirex_user', JSON.stringify(u));
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('empirex_user');
    clearToken();
  };

  const updateProfile = async (updates: Partial<User>) => {
    try {
      const session = await api.auth.updateProfile(updates);
      const u = toUser(session);
      setUser(u);
      localStorage.setItem('empirex_user', JSON.stringify(u));
    } catch {
      throw new Error('Failed to update profile');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, isHydrated, login, logout, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
