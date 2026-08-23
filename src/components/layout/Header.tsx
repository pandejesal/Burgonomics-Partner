import { Menu, Bell, LogOut } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';

export function Header() {
  const { toggleSidebar } = useAppStore();
  const { signOut, user } = useAuth();

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 lg:px-6">
      {/* Left: Mobile menu + welcome */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 hover:bg-primary/5 rounded-xl"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden lg:block">
          <h2 className="text-lg font-semibold text-text-primary">
            Welcome back, {user?.name?.split(' ')[0]}
          </h2>
        </div>
      </div>

      {/* Right: Notifications + Logout */}
      <div className="flex items-center gap-2">
        <button className="p-2 hover:bg-primary/5 rounded-xl relative">
          <Bell className="w-5 h-5 text-text-secondary" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <button
          onClick={signOut}
          className="p-2 hover:bg-primary/5 rounded-xl"
        >
          <LogOut className="w-5 h-5 text-text-secondary" />
        </button>
      </div>
    </header>
  );
}
