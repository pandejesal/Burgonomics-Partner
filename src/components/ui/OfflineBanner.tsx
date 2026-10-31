import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';

/**
 * Connectivity only — one boolean from the browser. Deliberately does NOT
 * queue, retry or sync anything: data staleness is a display problem here,
 * and existing per-screen behaviour (KDS outbox, mutations) is untouched.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // The event pair is not exhaustive (e.g. resume from sleep); re-read once.
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}

interface OfflineBannerProps {
  isOnline: boolean;
}

/**
 * Global "you are offline, what you see may be stale" banner (A11Y-21).
 * Orders, Menu and the admin portal all keep rendering their last data when
 * the network drops; without this they look live.
 */
export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  if (isOnline) return null;

  return (
    <div
      role="alert"
      data-testid="partner-offline-banner"
      className="bg-amber-600 text-black px-4 py-2 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider shadow-md z-50"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        You are offline — orders, stock and admin data on screen may be stale.
        Reconnect before acting on them.
      </span>
    </div>
  );
}

/**
 * Router-aware wrapper for the authenticated shell. KDS and the login page
 * already render their own, more specific offline notices, so they are not
 * doubled up here.
 */
export function GlobalOfflineBanner() {
  const isOnline = useOnlineStatus();
  const { pathname } = useLocation();
  if (pathname === '/kds' || pathname === '/login') return null;
  return <OfflineBanner isOnline={isOnline} />;
}

export default OfflineBanner;
