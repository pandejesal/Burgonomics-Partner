import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
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
  trend,
  color = 'primary',
}: StatsCardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary-dark',
    accent: 'bg-accent/10 text-accent',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-surface rounded-2xl p-4 lg:p-6 border border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="text-2xl lg:text-3xl font-bold text-text-primary mt-1">
            {typeof value === 'number' ? `₹${value.toLocaleString()}` : value}
          </p>
          {trend && (
            <p
              className={clsx(
                'text-sm mt-2',
                trend.isPositive ? 'text-accent' : 'text-red-500'
              )}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={clsx('p-3 rounded-xl', colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
