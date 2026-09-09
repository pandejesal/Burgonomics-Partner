import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { clsx } from 'clsx';
import { User, Store, Shield } from 'lucide-react';

export function Sidebar() {
  const { navItems } = useNavigation();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { user } = useAuthStore();
  const location = useLocation();

  return (
    <aside
      className={clsx(
        'fixed top-0 left-0 z-50 h-full w-64 bg-[#0D0F0D] border-r border-[#1E3A24] transition-transform duration-300 flex flex-col justify-between',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}
    >
      <div>
        {/* Logo Header */}
        <div className="h-16 flex items-center px-6 border-b border-[#1E3A24]">
          <Link
            to="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center space-x-2.5"
          >
            <div className="w-8 h-8 rounded-xl bg-[#D95D0F] flex items-center justify-center font-black text-white text-base shadow-sm">
              B
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">Burgonomics</h1>
              <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                Partner Console
              </p>
            </div>
          </Link>
        </div>

        {/* User Card */}
        <div className="p-4 border-b border-[#1E3A24] bg-[#112415]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E3A24] text-[#D95D0F] border border-[#234B2A] flex items-center justify-center font-bold text-sm">
              {user?.name?.charAt(0) || 'P'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Partner'}</p>
              <p className="text-[10px] text-zinc-400 capitalize font-medium">
                {user?.role?.replace('_', ' ') || 'Staff'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)]">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors',
                  isActive
                    ? 'bg-[#D95D0F] text-white shadow-sm'
                    : 'text-zinc-400 hover:bg-[#132A17] hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="min-w-5 h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Branding */}
      <div className="p-4 border-t border-[#1E3A24] bg-[#0A0C0A] text-[10px] text-zinc-500 flex items-center justify-between">
        <span>Petpooja POS & Firestore v2.4</span>
        <span className="text-emerald-500 font-mono">v1.2.0</span>
      </div>
    </aside>
  );
}

export default Sidebar;
