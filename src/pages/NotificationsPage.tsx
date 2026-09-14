import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { Spinner } from '@/components/ui/Spinner';
import {
  Bell,
  CheckCheck,
  ShoppingBag,
  Ticket,
  Info,
  Settings,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type NotificationTab = 'all' | 'order' | 'ticket' | 'system';

export function NotificationsPage() {
  const { notifications = [], isLoading, markAsRead, markAllAsRead } = useNotifications();
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => {
      if (activeTab === 'system') return n.type !== 'order' && n.type !== 'ticket';
      return n.type === activeTab;
    });
  }, [notifications, activeTab]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Notifications & Operational Alerts</span>
            {unreadCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FF6600] text-white font-bold">
                {unreadCount} New
              </span>
            )}
          </h1>
          <p className="text-xs text-neutral-400">
            Real-time incoming orders, ticket auto-escalations, and kitchen dispatch logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllAsRead && markAllAsRead.mutate()}
              disabled={markAllAsRead?.isPending}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 rounded-xl font-bold text-xs transition-colors cursor-pointer border border-emerald-500/40"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all as read</span>
            </button>
          )}

          <Link
            to="/settings"
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Notification Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-900 border border-neutral-800 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#0E4825] text-emerald-300 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          All ({notifications.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('order')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'order'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Orders</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ticket')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ticket'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Ticket className="w-3.5 h-3.5" />
          <span>Tickets</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('system')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'system'
              ? 'bg-cyan-700 text-white shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>System Alerts</span>
        </button>
      </div>

      {/* Notification Stream List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900/40 rounded-3xl border border-dashed border-neutral-800 p-8">
          <Bell className="w-12 h-12 mx-auto text-neutral-600 mb-3" />
          <h3 className="font-bold text-white text-base">All Caught Up!</h3>
          <p className="text-xs text-neutral-500 mt-1">
            No active notifications in this category.
          </p>
        </div>
      ) : (
        <div className="bg-neutral-900 rounded-3xl border border-neutral-800 divide-y divide-neutral-850 overflow-hidden shadow-xl">
          {filteredNotifications.map((notif) => {
            const timeAgo = (() => {
              try {
                if (notif.createdAt?.toDate) {
                  return formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true });
                }
                return 'Just now';
              } catch {
                return 'Recent';
              }
            })();

            const isOrder = notif.type === 'order';
            const isTicket = notif.type === 'ticket';

            return (
              <div
                key={notif.id}
                className={`flex items-start gap-4 p-4 sm:p-5 transition-colors ${
                  !notif.read ? 'bg-emerald-950/20' : 'hover:bg-neutral-850/40'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    isOrder
                      ? 'bg-orange-950/60 border-orange-800/60 text-orange-400'
                      : isTicket
                      ? 'bg-amber-950/60 border-amber-800/60 text-amber-400'
                      : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                  }`}
                >
                  {isOrder ? (
                    <ShoppingBag className="w-5 h-5" />
                  ) : isTicket ? (
                    <Ticket className="w-5 h-5" />
                  ) : (
                    <Info className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-white text-sm">{notif.title}</p>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-[#FF6600] animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    {notif.message}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium mt-2">
                    {timeAgo}
                  </p>
                </div>

                {!notif.read && markAsRead && (
                  <button
                    type="button"
                    onClick={() => markAsRead.mutate(notif.id)}
                    disabled={markAsRead.isPending}
                    className="p-2 text-neutral-400 hover:text-emerald-400 rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Mark as read"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
