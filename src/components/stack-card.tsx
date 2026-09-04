import Link from "next/link";
import type { Stack } from "@/lib/types";

const COLOR_MAP: Record<string, string> = {
  accent: "text-accent",
  violet: "text-violet",
  cyan: "text-cyan",
  success: "text-success",
  warning: "text-warning",
};

export function StackCard({ stack, count }: { stack: Stack; count: number }) {
  const colorClass = COLOR_MAP[stack.color] ?? "text-accent";
  return (
    <Link
      href={`/stacks/${stack.id}`}
      className="group flex flex-col justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-all hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between">
        <span className="text-xl">{stack.icon}</span>
        <span className={`font-mono text-xs font-semibold ${colorClass}`}>{count}</span>
      </div>
      <div>
        <h4 className="text-[13.5px] font-semibold text-text-primary group-hover:text-accent">{stack.name}</h4>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">{stack.description}</p>
      </div>
    </Link>
  );
}
