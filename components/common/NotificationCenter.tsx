'use client';

import { useState } from 'react';
import { useNotifications } from '@/lib/notifications-context';
import { Bell, X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500/10 border border-green-500/20';
      case 'error':
        return 'bg-red-500/10 border border-red-500/20';
      case 'warning':
        return 'bg-yellow-500/10 border border-yellow-500/20';
      default:
        return 'bg-blue-500/10 border border-blue-500/20';
    }
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-white">Notifications</h3>
            {notifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-gray-400 hover:text-blue-400 transition-colors"
                >
                  Mark all read
                </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3 opacity-50" />
                <p className="text-gray-400 text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                    notif.isRead ? 'bg-transparent' : 'bg-white/5'
                  } hover:bg-white/10`}
                  onClick={() => !notif.isRead && markAsRead(notif.id)}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">{getIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white text-sm flex items-center gap-2">
                        {notif.title}
                        {!notif.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{notif.message}</p>
                      <p className="text-xs text-gray-600 mt-2">
                        {notif.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      className="flex-shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-border text-center">
              <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
