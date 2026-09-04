import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  isCurrency?: boolean;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'primary' | 'secondary' | 'accent' | 'red';
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  isCurrency = false,
  trend,
  color = 'primary',
}: StatsCardProps) {
  const iconColorStyles = {
    primary: 'bg-[#0D0F0D] text-[#D95D0F] border border-[#D95D0F]/30',
    secondary: 'bg-[#0D0F0D] text-emerald-400 border border-emerald-500/30',
    accent: 'bg-[#0D0F0D] text-cyan-400 border border-cyan-500/30',
    red: 'bg-[#0D0F0D] text-rose-400 border border-rose-500/30',
  };

  const formattedValue =
    typeof value === 'number'
      ? isCurrency || title.toLowerCase().includes('revenue') || title.toLowerCase().includes('sales')
        ? `₹${value.toLocaleString()}`
        : value.toLocaleString()
      : value;

  return (
    <div className="bg-[#132A17] rounded-2xl p-4 lg:p-6 border border-[#234B2A] shadow-md text-white transition-all hover:border-[#D95D0F]/40">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</p>
          <p className="text-2xl lg:text-3xl font-extrabold text-white mt-1.5 font-mono">
            {formattedValue}
          </p>
          {trend && (
            <p
              className={`text-xs mt-2 font-semibold ${
                trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${iconColorStyles[color] || iconColorStyles.primary}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
