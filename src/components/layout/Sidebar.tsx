import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { clsx } from 'clsx';
import { Logo } from '@/components/ui/Logo';
import { User, Store, Shield, X } from 'lucide-react';

/* --- Off-canvas drawer accessibility (audit swarm-2026-10-13, finding 05-14) ---
 *
 * Below `lg` the aside is translated off-screen but stayed mounted, tabbable
 * and in the accessibility tree, so Tab walked through ~10 invisible links and
 * screen readers announced the nav twice. The drawer now carries `inert`
 * whenever it is off-canvas, which is exactly "closed AND viewport below the
 * docked breakpoint".
 *
 * The breakpoint is read from the same value Tailwind uses for `lg`
 * (`--breakpoint-lg: 64rem`) so the JS state can never disagree with the
 * `lg:translate-x-0` class that decides where the drawer actually is: CSS
 * docking it while JS calls it off-canvas would make a *visible* nav inert.
 */
export const SIDEBAR_ID = 'app-sidebar';
export const SIDEBAR_NAV_ID = 'app-sidebar-nav';
export const NAV_TOGGLE_ID = 'nav-menu-toggle';
export const SIDEBAR_DESKTOP_QUERY = '(min-width: 64rem)';

function mediaQueryMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    // No viewport information (server render, legacy runtime): assume the
    // docked layout so an on-screen nav is never reported as off-canvas.
    return true;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    // Query rejected by the runtime (legacy engine): fail safe. A nav we
    // cannot measure must stay focusable — never inert a *visible* nav.
    return true;
  }
}

function subscribeToMediaQuery(query: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mediaQueryList: MediaQueryList;
  try {
    mediaQueryList = window.matchMedia(query);
  } catch {
    return () => {};
  }
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', onChange);
    return () => mediaQueryList.removeEventListener('change', onChange);
  }
  // Safari < 14 / very old WebViews
  mediaQueryList.addListener(onChange);
  return () => mediaQueryList.removeListener(onChange);
}

/** True while the viewport is at Tailwind `lg` and up, i.e. the aside is docked. */
export function useIsSidebarDocked(query: string = SIDEBAR_DESKTOP_QUERY): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeToMediaQuery(query, onChange),
    () => mediaQueryMatches(query),
    () => mediaQueryMatches(query)
  );
}

export function Sidebar() {
  const { navItems } = useNavigation();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { user } = useAuthStore();
  const location = useLocation();
  const isDocked = useIsSidebarDocked();
  const asideRef = useRef<HTMLElement | null>(null);

  // Off-canvas: closed *and* below `lg`. Never inert while docked, so the
  // permanent desktop nav keeps its tab order.
  const isOffCanvas = !sidebarOpen && !isDocked;
  const previouslyOffCanvasRef = useRef(isOffCanvas);

  // Escape closes the open drawer (keyboard users have no other way out once
  // focus has moved inside and the header toggle sits behind the drawer).
  useEffect(() => {
    if (!sidebarOpen || isDocked) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, isDocked, setSidebarOpen]);

  // Opening moves focus to the first nav link so keyboard/SR users land in the
  // drawer instead of behind it.
  useEffect(() => {
    if (!sidebarOpen || isDocked) return;
    const firstLink = asideRef.current?.querySelector<HTMLElement>(`#${SIDEBAR_NAV_ID} a`);
    firstLink?.focus();
  }, [sidebarOpen, isDocked]);

  // When the drawer becomes off-canvas (closed, or the viewport shrank below
  // `lg` with focus inside the docked nav) return focus to the header toggle
  // whenever focus was inside it or already dropped to <body>, e.g. after a
  // backdrop click. React applies `inert` before effects run, so focus can
  // arrive here either still on a link or already reset to the body.
  useEffect(() => {
    const wasOffCanvas = previouslyOffCanvasRef.current;
    previouslyOffCanvasRef.current = isOffCanvas;
    if (wasOffCanvas === isOffCanvas || !isOffCanvas) return;
    const active = document.activeElement;
    const aside = asideRef.current;
    const focusWasInside = aside !== null && active !== null && aside.contains(active);
    if (focusWasInside || active === null || active === document.body) {
      document.getElementById(NAV_TOGGLE_ID)?.focus();
    }
  }, [isOffCanvas]);

  return (
    <aside
      ref={asideRef}
      id={SIDEBAR_ID}
      inert={isOffCanvas}
      className={clsx(
        'fixed top-0 left-0 z-50 h-full w-64 bg-bg border-r border-[#1E3A24] transition-transform duration-300 flex flex-col justify-between',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}
    >
      <div>
        {/* Logo Header */}
        <div className="h-16 flex items-center justify-between pl-6 pr-2 border-b border-[#1E3A24]">
          <Link
            to="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center space-x-2.5"
          >
            <Logo size={32} showText={false} className="shrink-0" />
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">Burgonomics</h1>
              <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                Partner Console
              </p>
            </div>
          </Link>

          {/* Explicit accessible close affordance — the header toggle sits
              behind the open drawer (z-50 > z-30), so tap/SR users need one. */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden flex w-9 h-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-surface hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-4 border-b border-[#1E3A24] bg-[#112415]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover text-accent-light border border-border flex items-center justify-center font-bold text-sm">
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

        {/* Navigation Items — named landmark so it is distinguishable from the
            rest of the page when the drawer is open (only one <nav> here). */}
        <nav
          id={SIDEBAR_NAV_ID}
          aria-label="Primary"
          className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)]"
        >
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
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-zinc-400 hover:bg-surface hover:text-white'
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
