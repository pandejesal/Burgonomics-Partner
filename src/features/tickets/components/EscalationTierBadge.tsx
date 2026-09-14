import React from 'react';
import { ShieldCheck, AlertTriangle, Flame, Clock } from 'lucide-react';

export type EscalationLevel =
  | 'L1_STORE'
  | 'L2_REGIONAL'
  | 'L3_EXECUTIVE'
  | 'branch'
  | 'brand_support'
  | 'developer_team';

interface EscalationTierBadgeProps {
  level: EscalationLevel | string;
  createdAt?: string | number | { toDate?: () => Date; toMillis?: () => number };
  showTimer?: boolean;
}

export function EscalationTierBadge({
  level,
  createdAt,
  showTimer = false,
}: EscalationTierBadgeProps) {
  const normalizedLevel =
    level === 'developer_team' || level === 'L3_EXECUTIVE'
      ? 'L3_EXECUTIVE'
      : level === 'brand_support' || level === 'L2_REGIONAL'
      ? 'L2_REGIONAL'
      : 'L1_STORE';

  const getElapsedMinutes = () => {
    if (!createdAt) return 0;
    const millis = (createdAt as any)?.toDate
      ? (createdAt as any).toDate().getTime()
      : (createdAt as any)?.toMillis
      ? (createdAt as any).toMillis()
      : typeof createdAt === 'string'
      ? new Date(createdAt).getTime()
      : typeof createdAt === 'number'
      ? createdAt
      : Date.now();
    return Math.max(0, Math.floor((Date.now() - millis) / 60000));
  };

  const elapsedMins = getElapsedMinutes();

  if (normalizedLevel === 'L3_EXECUTIVE') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-300 font-bold text-[10px] uppercase tracking-wider shadow-sm animate-pulse">
        <Flame className="w-3 h-3 text-rose-400 shrink-0" />
        <span>L3 Executive Escalation</span>
        {showTimer && (
          <span className="font-mono text-rose-400 bg-rose-900/60 px-1.5 py-0.5 rounded-md text-[9px]">
            {elapsedMins}m sitting
          </span>
        )}
      </div>
    );
  }

  if (normalizedLevel === 'L2_REGIONAL') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/90 border border-amber-500/60 text-amber-300 font-bold text-[10px] uppercase tracking-wider shadow-sm">
        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
        <span>L2 Regional Escalation</span>
        {showTimer && (
          <span className="font-mono text-amber-400 bg-amber-900/60 px-1.5 py-0.5 rounded-md text-[9px]">
            {elapsedMins}m sitting
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0E4825]/90 border border-emerald-500/60 text-emerald-300 font-bold text-[10px] uppercase tracking-wider shadow-sm">
      <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
      <span>L1 Store Queue</span>
      {showTimer && (
        <span className="font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded-md text-[9px]">
          {elapsedMins < 15 ? `${15 - elapsedMins}m SLA` : `${elapsedMins}m elapsed`}
        </span>
      )}
    </div>
  );
}

export default EscalationTierBadge;
