import type { HTMLAttributes } from 'react';
import { classNames } from '@/utils/helpers';

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classNames('rounded-xl border border-border bg-surface p-4 shadow-sm', className)}
      {...props}
    />
  );
}
