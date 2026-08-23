import { Link } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell } from 'lucide-react';

export function NotificationBell() {
  const { unreadCount } = useNotifications();

  return (
    <Link
      to="/notifications"
      className="relative p-2 hover:bg-primary/5 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center"
      title="Notifications"
    >
      <Bell className="w-5 h-5 text-text-secondary" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
