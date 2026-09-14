import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, AlertCircle } from 'lucide-react';

interface KOTTimerBadgeProps {
  createdAt: any;
  className?: string;
  onSlaBreach?: () => void;
}

export type SlaTier = 'green' | 'amber' | 'red';

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
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getMillis = (ts: any): number => {
    if (!ts) return now;
    if (typeof ts === 'number') return ts;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? now : parsed;
  };

  const elapsedSeconds = Math.max(0, Math.floor((now - getMillis(createdAt)) / 1000));
  const { tier, formatted } = calculateKOTElaTier(elapsedSeconds);

  useEffect(() => {
    if (tier === 'red' && onSlaBreach) {
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
