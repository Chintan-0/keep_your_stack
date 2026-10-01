import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Stack, Resource } from "@/lib/types";
import { Favicon } from "@/components/ui/favicon";
import { cn } from "@/lib/utils";

const COLOR_MAP: Record<string, { text: string; soft: string; dot: string }> = {
  accent: { text: "text-accent", soft: "bg-accent-soft", dot: "bg-accent" },
  violet: { text: "text-violet", soft: "bg-violet-soft", dot: "bg-violet" },
  cyan: { text: "text-cyan", soft: "bg-cyan-soft", dot: "bg-cyan" },
  success: { text: "text-success", soft: "bg-success-soft", dot: "bg-success" },
  warning: { text: "text-warning", soft: "bg-warning-soft", dot: "bg-warning" },
};

// CSS var name for each stack color, so the card's own glow/gradient can
// reference it directly (color-mix works on CSS custom properties, not on
// Tailwind's compiled utility classes).
const COLOR_VAR: Record<string, string> = {
  accent: "--accent",
  violet: "--violet",
  cyan: "--cyan",
  success: "--success",
  warning: "--warning",
};

export function StackCard({
  stack,
  count,
  resources,
}: {
  stack: Stack;
  count: number;
  /** Optional — when passed, shows a small row of this stack's own resource favicons as a representative preview (§"visual collections"). Active resources only; the caller already has that filter applied. */
  resources?: Resource[];
}) {
  const color = COLOR_MAP[stack.color] ?? COLOR_MAP.accent;
  const colorVar = COLOR_VAR[stack.color] ?? COLOR_VAR.accent;
  const preview = resources?.filter((r) => r.stackIds.includes(stack.id)).slice(0, 4) ?? [];

  return (
    <Link
      href={`/stacks/${stack.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/15 motion-reduce:transition-colors motion-reduce:hover:translate-y-0"
    >
      {/* A soft corner glow in the stack's own color — same restrained
          "one accent, not a colored card" language as ResourceCard, just
          atmospheric rather than a flat line, so stacks read as distinct
          "collections" rather than identical rows (§"Pinned stacks"). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl transition-opacity duration-200 group-hover:opacity-40"
        style={{ background: `var(${colorVar})` }}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-base shadow-sm"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(${colorVar}) 30%, transparent), color-mix(in srgb, var(${colorVar}) 12%, transparent))`,
            border: `1px solid color-mix(in srgb, var(${colorVar}) 35%, transparent)`,
          }}
        >
          {stack.icon}
        </span>
        <ChevronRight size={16} className="mt-2 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

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

      {preview.length > 0 && (
        <div className="mt-auto flex items-center gap-1 pt-1">
          {preview.map((r) => (
            <Favicon key={r.id} seed={r.title} size={22} className="ring-2 ring-surface" />
          ))}
          {count > preview.length && (
            <span className="ml-0.5 font-mono text-[10.5px] text-text-muted">+{count - preview.length}</span>
          )}
        </div>
      )}
    </Link>
  );
}
