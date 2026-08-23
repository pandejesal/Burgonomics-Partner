import type { ButtonHTMLAttributes } from 'react';
import { classNames } from '@/utils/helpers';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md';
}

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';
  const variants: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-light',
    secondary: 'bg-secondary text-text-primary hover:bg-secondary-light',
    outline: 'border border-border bg-surface text-text-primary hover:bg-bg',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
  };

  return (
    <button
      type={type}
      className={classNames(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
