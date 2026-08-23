import { Menu, LogOut } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { NotificationBell } from './NotificationBell';
import { BranchSwitcher } from './BranchSwitcher';

export function Header() {
  const { toggleSidebar } = useAppStore();
  const { signOut, user } = useAuth();

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 shadow-2xs">
      {/* Left: Mobile menu + Outlet Switcher + Welcome */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 hover:bg-primary/5 rounded-xl cursor-pointer shrink-0"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5 text-text-primary" />
        </button>

        {/* Global Outlet Switcher */}
        <BranchSwitcher />

        <div className="hidden xl:block pl-2 border-l border-border/70">
          <p className="text-xs text-text-secondary truncate">
            Welcome back, <strong className="text-text-primary font-semibold">{user?.name?.split(' ')[0] || 'Operator'}</strong>
          </p>
        </div>
      </div>

      {/* Right: Notification Bell + Logout */}
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell />

        <button
          onClick={signOut}
          className="p-2 hover:bg-red-50 text-text-secondary hover:text-red-600 rounded-xl transition-colors cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

export default Header;
