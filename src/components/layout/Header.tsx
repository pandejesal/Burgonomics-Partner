import { Link } from 'react-router-dom';
import { Menu, LogOut, ChefHat } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { NotificationBell } from './NotificationBell';
import { BranchSwitcher } from './BranchSwitcher';
import { PetpoojaStatusBadge } from '@/components/ui/PetpoojaStatusBadge';

export function Header() {
  const { toggleSidebar, selectedBranchId } = useAppStore();
  const { signOut, user } = useAuthStore();

  return (
    <header className="h-16 bg-bg border-b border-[#1E3A24] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 shadow-md">
      {/* Left: Mobile menu + Outlet Switcher + Welcome */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 hover:bg-surface rounded-xl text-zinc-300 hover:text-white cursor-pointer shrink-0"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Outlet / City Switcher */}
        <BranchSwitcher />

        {/* Role Badge */}
        {user?.role && (
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface text-accent-light border border-border">
            {user.role.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Right: KDS Quick Link + Petpooja POS Badge + Notification Bell + Logout */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Link
          to="/kds"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-hover hover:bg-[#284f30] text-accent-light hover:text-[#ff7a26] border border-[#2e5e39] text-xs font-black shadow-sm transition-colors cursor-pointer"
          title="Open Fullscreen Kitchen Display System"
        >
          <ChefHat className="w-4 h-4 text-accent-light" />
          <span className="hidden md:inline">Kitchen KDS</span>
        </Link>

        <PetpoojaStatusBadge branchId={selectedBranchId || user?.branchIds?.[0] || 'branch_surat_01'} />

        <NotificationBell />

        <button
          onClick={signOut}
          className="p-2 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

export default Header;

