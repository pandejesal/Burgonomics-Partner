import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DataWarningBannerProps {
  warnings?: string[];
}

/**
 * DataWarningBanner — visible counterpart to console-only fetch fallbacks.
 * Render wherever partially-loaded data is shown so staff never mistake a
 * degraded backend for "no orders / zero revenue".
 */
export function DataWarningBanner({ warnings }: DataWarningBannerProps) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-3.5 text-amber-200"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wider">Partial data</p>
        <ul className="mt-1 space-y-0.5 text-xs">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default DataWarningBanner;
