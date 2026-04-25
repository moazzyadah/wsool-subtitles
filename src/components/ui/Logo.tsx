import { cn } from '@/lib/utils';

export default function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-2 font-semibold', className)}>
      <span
        aria-hidden
        className="grid place-items-center w-7 h-7 rounded-lg bg-foreground text-background text-[13px]"
      >
        و
      </span>
      <span className="text-foreground tracking-tight">wsool · subtitles</span>
    </div>
  );
}
