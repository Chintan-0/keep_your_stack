import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[var(--radius-sm)]", className)} />;
}

export function ResourceCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-[8px]" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** Matches StackCard's shape: icon chip, name, "{count} resources" line. */
export function StackCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <Skeleton className="h-9 w-9 rounded-[var(--radius-sm)]" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

/** Matches the Home dashboard's MetricPill shape: a number and a label. */
export function MetricSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3.5 py-2.5">
      <Skeleton className="h-2 w-2 rounded-full" />
      <Skeleton className="h-5 w-8" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
