'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, getToken } from './api';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (type: Notification['type'], title: string, message: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

function toNotification(n: { id: number; type: string; title: string; message: string; is_read: number; created_at: string }): Notification {
  return {
    id: String(n.id),
    type: n.type as Notification['type'],
    title: n.title,
    message: n.message,
    timestamp: new Date(n.created_at),
    isRead: n.is_read === 1,
  };
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sinceId, setSinceId] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    setIsAuthed(!!getToken());
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!getToken()) return;
    try {
      const data = await api.notifications.list(sinceId);
      if (data.length > 0) {
        const newNotifs = data.map(toNotification);
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const fresh = newNotifs.filter((n) => !existingIds.has(n.id));
          return [...fresh, ...prev].slice(0, 100);
        });
        setSinceId(data[0].id);
      }
    } catch {
      // silently fail
    }
  }, [sinceId]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setNotifications([]);
      return;
    }

    // Initial fetch
    setSinceId(0);
    setNotifications([]);
    fetchNotifications();

    // Poll every 5s
    pollRef.current = setInterval(fetchNotifications, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const addNotification = (type: Notification['type'], title: string, message: string) => {
    const newNotification: Notification = {
      id: 'local-' + Date.now().toString(),
      type,
      title,
      message,
      timestamp: new Date(),
      isRead: false,
    };
    setNotifications((prev) => [newNotification, ...prev]);
  };

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    if (!id.startsWith('local-')) {
      try { await api.notifications.markRead(parseInt(id)); } catch {}
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try { await api.notifications.markAllRead(); } catch {}
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
    markAllAsRead();
  };

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
