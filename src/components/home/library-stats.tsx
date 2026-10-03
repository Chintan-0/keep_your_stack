"use client";

import Link from "next/link";
import { Boxes, Layers, FolderTree, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import { SEMANTIC_COLOR_CLASSES, type SemanticColor } from "@/lib/colors";

function StatCard({
  href,
  icon: Icon,
  value,
  label,
  color,
}: {
  href: string;
  icon: React.ElementType;
  value: number;
  label: string;
  color: SemanticColor;
}) {
  const palette = SEMANTIC_COLOR_CLASSES[color];
  const { ref, value: shown } = useCountUp<HTMLAnchorElement>(value);
  return (
    <Link
      ref={ref}
      href={href}
      className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/10 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-hover:rotate-0", palette.soft)}>
        <Icon size={18} className={palette.text} />
      </span>
      <div className="min-w-0">
        <p className="text-[19px] font-semibold leading-tight text-text-primary tabular-nums">{shown.toLocaleString()}</p>
        <p className="truncate text-[12px] text-text-secondary">{label}</p>
      </div>
    </Link>
  );
}

/** A small ring built from one SVG circle + a stroke-dasharray offset — no chart library for one number. */
function HealthRing({ percent }: { percent: number }) {
  const size = 40;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const { ref, value: shownPercent } = useCountUp<SVGSVGElement>(percent, 1100);
  const offset = circumference * (1 - shownPercent / 100);
  const color = percent >= 80 ? "var(--success)" : percent >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-strong)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="motion-reduce:transition-none"
      />
    </svg>
  );
}

export function LibraryStats({
  totalResources,
  stackCount,
  categoryCount,
  favoriteCount,
  healthPercent,
}: {
  totalResources: number;
  stackCount: number;
  categoryCount: number;
  favoriteCount: number;
  /** null while there's nothing to measure yet (empty library) — shown as a dash, never a fake 100%. */
  healthPercent: number | null;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <StatCard href="/resources" icon={Boxes} value={totalResources} label="Resources" color="blue" />
      <StatCard href="/stacks" icon={Layers} value={stackCount} label="Stacks" color="violet" />
      <StatCard href="/settings/categories" icon={FolderTree} value={categoryCount} label="Categories" color="orange" />
      <StatCard href="/favorites" icon={Star} value={favoriteCount} label="Favorites" color="coral" />
      <Link
        href="/library"
        className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/10 motion-reduce:hover:translate-y-0"
      >
        <HealthRing percent={healthPercent ?? 0} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight text-text-primary">
            {healthPercent === null ? "–" : `${healthPercent}%`}
          </p>
          <p className="truncate text-[11.5px] text-text-secondary">
            {healthPercent === null ? "Library Health" : healthPercent >= 80 ? "Well organized" : "Needs a look"}
          </p>
        </div>
      </Link>
    </section>
  );
}
