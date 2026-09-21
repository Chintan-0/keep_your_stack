import Link from "next/link";
import type { Stack } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLOR_MAP: Record<string, { text: string; soft: string; dot: string }> = {
  accent: { text: "text-accent", soft: "bg-accent-soft", dot: "bg-accent" },
  violet: { text: "text-violet", soft: "bg-violet-soft", dot: "bg-violet" },
  cyan: { text: "text-cyan", soft: "bg-cyan-soft", dot: "bg-cyan" },
  success: { text: "text-success", soft: "bg-success-soft", dot: "bg-success" },
  warning: { text: "text-warning", soft: "bg-warning-soft", dot: "bg-warning" },
};

export function StackCard({ stack, count }: { stack: Stack; count: number }) {
  const color = COLOR_MAP[stack.color] ?? COLOR_MAP.accent;
  return (
    <Link
      href={`/stacks/${stack.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-4 pl-[18px] transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2 hover:shadow-lg hover:shadow-black/20 motion-reduce:transform-none motion-reduce:transition-colors"
    >
      {/* A thin colored spine along the left edge — the same restrained
          "one accent line, not a colored card" language as ResourceCard's
          top bar, oriented differently so the two read as siblings rather
          than duplicates. */}
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", color.dot)} />

      <span
        className={cn("flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-base", color.soft)}
      >
        {stack.icon}
      </span>
      <div className="min-w-0">
        <h4 className="truncate text-[13.5px] font-semibold text-text-primary group-hover:text-accent">
          {stack.name}
        </h4>
        <p className={cn("mt-0.5 text-[12px]", color.text)}>
          {count} resource{count === 1 ? "" : "s"}
        </p>
        {stack.description && (
          <p className="mt-1 line-clamp-1 text-[11.5px] text-text-muted">{stack.description}</p>
        )}
      </div>
    </Link>
  );
}
