import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
}

export default function Tooltip({ label, children, position = 'bottom', className }: TooltipProps) {
  return (
    <div className={cn('relative group/tooltip inline-flex', className)}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-[60]',
          'px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap',
          'bg-foreground text-background shadow-lg',
          'opacity-0 group-hover/tooltip:opacity-100',
          'transition-all duration-200 ease-out',
          'scale-95 group-hover/tooltip:scale-100',
          position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
        )}
      >
        {label}
      </span>
    </div>
  );
}
