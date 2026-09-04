import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/50 px-6 py-16 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-text-secondary">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="max-w-xs text-[13px] text-text-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}
