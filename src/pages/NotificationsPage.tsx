import { useNotifications } from '@/hooks/useNotifications';
import { Spinner } from '@/components/ui/Spinner';
import { Bell, Check, CheckCheck, ShoppingBag, Ticket, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function NotificationsPage() {
  const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Notifications</h1>
          <p className="text-sm text-text-secondary">
            System alerts, kitchen dispatch updates, and customer ticket events.
          </p>
        </div>

        {notifications?.some((n) => !n.read) && (
          <button
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 text-primary hover:bg-primary/5 rounded-xl font-semibold text-xs transition-colors cursor-pointer border border-primary/20"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !notifications?.length ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-border">
          <Bell className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" />
          <h3 className="font-semibold text-text-primary">All caught up</h3>
          <p className="text-sm text-text-secondary mt-1">
            No new notifications or alerts at this time.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border divide-y divide-border/70 overflow-hidden shadow-xs">
          {notifications.map((notif) => {
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

            return (
              <div
                key={notif.id}
                className={`flex items-start gap-4 p-4 sm:p-5 transition-colors ${
                  !notif.read ? 'bg-primary/5' : 'hover:bg-bg/40'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    notif.type === 'order'
                      ? 'bg-blue-100 text-blue-700'
                      : notif.type === 'ticket'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {notif.type === 'order' ? (
                    <ShoppingBag className="w-5 h-5" />
                  ) : notif.type === 'ticket' ? (
                    <Ticket className="w-5 h-5" />
                  ) : (
                    <Info className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-text-primary text-sm">{notif.title}</p>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    {notif.message}
                  </p>
                  <p className="text-[11px] text-text-secondary/80 font-medium mt-2">
                    {timeAgo}
                  </p>
                </div>

                {!notif.read && (
                  <button
                    onClick={() => markAsRead.mutate(notif.id)}
                    disabled={markAsRead.isPending}
                    className="p-2 hover:bg-primary/10 rounded-xl text-primary transition-colors cursor-pointer shrink-0"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4" />
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
