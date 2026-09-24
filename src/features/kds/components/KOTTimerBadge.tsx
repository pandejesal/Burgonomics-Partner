import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, AlertCircle } from 'lucide-react';

interface KOTTimerBadgeProps {
  createdAt: any;
  className?: string;
  onSlaBreach?: () => void;
}

export type SlaTier = 'green' | 'amber' | 'red';

// Shared 1-second clock: 30 makeline cards used to own 30 intervals.
// One interval fans out to every mounted badge via a setter registry;
// the last unmount stops the clock.
const tickSetters = new Set<React.Dispatch<React.SetStateAction<number>>>();
let sharedTickTimer: ReturnType<typeof setInterval> | null = null;
function useSharedSecond(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    tickSetters.add(setTick);
    if (!sharedTickTimer) {
      sharedTickTimer = setInterval(() => {
        tickSetters.forEach((s) => s((t) => t + 1));
      }, 1000);
    }
    return () => {
      tickSetters.delete(setTick);
      if (tickSetters.size === 0 && sharedTickTimer) {
        clearInterval(sharedTickTimer);
        sharedTickTimer = null;
      }
    };
  }, []);
}

export function calculateKOTElaTier(elapsedSeconds: number): {
  tier: SlaTier;
  formatted: string;
  minutes: number;
  seconds: number;
} {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  let tier: SlaTier = 'green';
  if (elapsedSeconds >= 600) {
    // Over 10 mins -> Delayed Red Alert
    tier = 'red';
  } else if (elapsedSeconds >= 300) {
    // 5 to 10 mins -> Warning Amber
    tier = 'amber';
  } else {
    // Under 5 mins -> Target Green
    tier = 'green';
  }

  return { tier, formatted, minutes, seconds };
}

export function KOTTimerBadge({ createdAt, className = '', onSlaBreach }: KOTTimerBadgeProps) {
  useSharedSecond();
  const now = Date.now();
  const breachFiredRef = React.useRef(false);

  // Unknown time renders as unknown ("—"), never as a fresh green 00:00:
  // the old fallback returned `now` for missing/unparseable input, painting
  // untimed orders as just placed.
  const getMillis = (ts: any): number | null => {
    if (!ts) return null;
    if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
    if (typeof ts.toDate === 'function') {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof ts.toMillis === 'function') {
      const ms = ts.toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    }
    if (ts.seconds) return ts.seconds * 1000;
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? null : parsed;
  };

  const startedAt = getMillis(createdAt);
  if (startedAt === null) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-400 font-mono font-bold text-xs sm:text-sm tracking-wider select-none ${className}`}
        title="Order time unknown"
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>—</span>
      </div>
    );
  }
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const { tier, formatted } = calculateKOTElaTier(elapsedSeconds);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Once per mount: an inline parent callback re-fires every render while
    // red, which used to re-trigger the breach alarm continuously.
    if (tier === 'red' && onSlaBreach && !breachFiredRef.current) {
      breachFiredRef.current = true;
      onSlaBreach();
    }
  }, [tier, onSlaBreach]);

  if (tier === 'red') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/80 border border-red-500/80 text-red-300 font-mono font-black text-xs sm:text-sm tracking-wider animate-pulse shadow-sm shadow-red-900/40 select-none ${className}`}
        title="Kitchen Prep SLA Delayed (>10 Mins)"
      >
        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 stroke-[2.5]" />
        <span>{formatted}</span>
      </div>
    );
  }

  if (tier === 'amber') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-500/50 text-amber-300 font-mono font-bold text-xs sm:text-sm tracking-wider select-none ${className}`}
        title="Prep Warning (5–10 Mins)"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>{formatted}</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs sm:text-sm tracking-wider select-none ${className}`}
      title="Freshly Placed (<5 Mins)"
    >
      <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <span>{formatted}</span>
    </div>
  );
}

export default KOTTimerBadge;
