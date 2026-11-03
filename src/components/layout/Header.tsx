import { Link } from 'react-router-dom';
import { Menu, LogOut, ChefHat } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { NotificationBell } from './NotificationBell';
import { BranchSwitcher } from './BranchSwitcher';
import { NAV_TOGGLE_ID, SIDEBAR_ID } from './Sidebar';
import { PetpoojaStatusBadge } from '@/components/ui/PetpoojaStatusBadge';
import { Logo } from '@/components/ui/Logo';

export function Header() {
  const { toggleSidebar, selectedBranchId, sidebarOpen } = useAppStore();
  const { signOut, user } = useAuthStore();

  const badgeBranchId =
    selectedBranchId && selectedBranchId !== 'all' ? selectedBranchId : user?.branchIds?.[0];

  return (
    <header
      className="bg-bg border-b border-[#1E3A24] flex flex-col gap-2 px-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-4 lg:px-6 sticky top-0 z-30 shadow-md"
      style={{
        minHeight: 'calc(4rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
        paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
      }}
    >
      {/* Brand row: mascot + MonstroSolid wordmark stays readable on mobile
          (it used to be mascot-only), and may wrap instead of being clipped. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
        <Link
          to="/dashboard"
          aria-label="Burgonomics Partner dashboard"
          className="flex min-w-0 min-h-11 flex-1 items-center"
        >
          <Logo size={30} showText />
        </Link>
        <button
          type="button"
          id={NAV_TOGGLE_ID}
          onClick={toggleSidebar}
          className="lg:hidden min-h-11 min-w-11 p-2 hover:bg-surface rounded-xl text-zinc-300 hover:text-white cursor-pointer shrink-0"
          aria-label="Toggle navigation menu"
          aria-expanded={sidebarOpen}
          aria-controls={SIDEBAR_ID}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Outlet + actions row: wraps under the brand row on small widths. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-3">
        {/* Global Outlet / City Switcher */}
        <BranchSwitcher />

        {/* Role Badge */}
        {user?.role && (
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface text-accent-light border border-border">
            {user.role.replace('_', ' ')}
          </span>
        )}

        {/* KDS Quick Link */}
        <Link
          to="/kds"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-hover hover:bg-[#284f30] text-accent-light hover:text-[#ff7a26] border border-[#2e5e39] text-xs font-black shadow-sm transition-colors cursor-pointer"
          title="Open Fullscreen Kitchen Display System"
          aria-label="Open Fullscreen Kitchen Display System"
        >
          <ChefHat className="w-4 h-4 text-accent-light" />
          <span className="hidden lg:inline">Kitchen KDS</span>
        </Link>

        {badgeBranchId ? (
          <PetpoojaStatusBadge branchId={badgeBranchId} />
        ) : (
          <span className="flex shrink-0 items-center bg-surface/80 border border-border px-2 sm:px-2.5 py-1.5 rounded-full text-xs text-zinc-400">
            Petpooja POS: select an outlet
          </span>
        )}

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

