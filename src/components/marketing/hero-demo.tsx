"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useReducedMotion } from "./scroll-reveal";
import { track } from "./track";

// Deliberately static demo data — this is a product DEMONSTRATION for
// anonymous visitors, never a real query against the database (per the
// Phase 15.5 spec: "does NOT need to call the real database for anonymous
// visitors... clearly keep demo data separate from production user
// data"). Every field shape (title/domain/category/tags) mirrors the
// real Resource type; nothing here is a capability that doesn't exist.
interface DemoCard {
  id: string;
  title: string;
  domain: string;
  color: string;
  category: string;
  /** Which demo search queries this card should rise for — see QUERIES below. */
  matches: string[];
}

const CARDS: DemoCard[] = [
  { id: "hoppscotch", title: "Hoppscotch", domain: "hoppscotch.io", color: "#22d3ee", category: "Development / API", matches: ["test graphql", "api testing"] },
  { id: "tinypng", title: "TinyPNG", domain: "tinypng.com", color: "#34d399", category: "Design / Assets", matches: ["compress images"] },
  { id: "tableplus", title: "TablePlus", domain: "tableplus.com", color: "#a78bfa", category: "Development / Database", matches: ["database gui"] },
  { id: "svgr", title: "SVGR", domain: "react-svgr.com", color: "#f5b756", category: "Development / Frontend", matches: ["convert svg to react"] },
  { id: "vercel", title: "Vercel", domain: "vercel.com", color: "#e8eaf0", category: "DevOps / Deployment", matches: ["deployment tools"] },
  { id: "github", title: "GitHub", domain: "github.com", color: "#9aa2b1", category: "Development / Tools", matches: [] },
  { id: "figma", title: "Figma", domain: "figma.com", color: "#f87171", category: "Design / UI", matches: [] },
  { id: "supabase", title: "Supabase", domain: "supabase.com", color: "#34d399", category: "Development / Backend", matches: ["database gui"] },
  { id: "mdn", title: "MDN Web Docs", domain: "developer.mozilla.org", color: "#6f7bff", category: "Documentation", matches: [] },
];

// Fixed, hand-placed "scattered" positions (percent-based so it holds up
// across the hero's own responsive sizing) — never randomized on each
// render, so the layout is stable and testable, and identical for every
// visitor and every load.
const SCATTERED: Record<string, { x: number; y: number; rotate: number }> = {
  hoppscotch: { x: 6, y: 10, rotate: -8 },
  tinypng: { x: 62, y: 4, rotate: 6 },
  tableplus: { x: 30, y: 32, rotate: 4 },
  svgr: { x: 74, y: 40, rotate: -5 },
  vercel: { x: 4, y: 55, rotate: 5 },
  github: { x: 46, y: 60, rotate: -3 },
  figma: { x: 66, y: 68, rotate: 7 },
  supabase: { x: 20, y: 78, rotate: -6 },
  mdn: { x: 52, y: 8, rotate: 3 },
};

// Organized: three tidy columns (Stacks), three cards each — the visual
// payoff of "chaos → organization" the spec asks for.
const ORGANIZED: Record<string, { x: number; y: number; rotate: number }> = {
  hoppscotch: { x: 6, y: 8, rotate: 0 },
  supabase: { x: 6, y: 38, rotate: 0 },
  tableplus: { x: 6, y: 68, rotate: 0 },
  svgr: { x: 38, y: 8, rotate: 0 },
  github: { x: 38, y: 38, rotate: 0 },
  mdn: { x: 38, y: 68, rotate: 0 },
  figma: { x: 70, y: 8, rotate: 0 },
  tinypng: { x: 70, y: 38, rotate: 0 },
  vercel: { x: 70, y: 68, rotate: 0 },
};

const QUERIES = ["compress images", "test graphql", "database gui", "convert svg to react", "api testing", "deployment tools"];

export function HeroDemo() {
  const reducedMotion = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const [queryIndex, setQueryIndex] = useState<number | null>(null);
  const [typedQuery, setTypedQuery] = useState("");

  // Phase 1 (once, ~1.4s after mount): chaos settles into organized
  // stacks. Phase 2 (looping, every ~3.4s after that): a demo search
  // query "flies in," matching cards rise and highlight. Reduced-motion
  // visitors skip straight to the organized end-state with the first
  // query already shown, statically — same information, no motion — via
  // the derived values below rather than by setting state in the effect.
  useEffect(() => {
    if (reducedMotion) return;
    const settleTimer = setTimeout(() => setSettled(true), 1200);
    return () => clearTimeout(settleTimer);
  }, [reducedMotion]);

  const organized = settled || reducedMotion;

  useEffect(() => {
    if (reducedMotion || !organized) return;
    let cancelled = false;
    let cycleTimer: ReturnType<typeof setTimeout>;

    function runCycle(index: number) {
      const query = QUERIES[index];
      setQueryIndex(index);
      setTypedQuery("");
      let i = 0;
      const typeInterval = setInterval(() => {
        i++;
        setTypedQuery(query.slice(0, i));
        if (i >= query.length) {
          clearInterval(typeInterval);
          if (!cancelled) cycleTimer = setTimeout(() => runCycle((index + 1) % QUERIES.length), 2200);
        }
      }, 45);
    }
    const startTimer = setTimeout(() => runCycle(0), 500);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearTimeout(cycleTimer);
    };
  }, [organized, reducedMotion]);

  const activeQuery = reducedMotion ? QUERIES[0] : queryIndex !== null ? QUERIES[queryIndex] : null;
  const displayedQuery = reducedMotion ? QUERIES[0] : typedQuery;
  const matchedIds = new Set(activeQuery ? CARDS.filter((c) => c.matches.includes(activeQuery)).map((c) => c.id) : []);

  return (
    <div
      className="relative mx-auto h-[420px] w-full max-w-xl sm:h-[460px]"
      onMouseEnter={() => track("homepage_demo_interacted", "hero-hover")}
    >
      {CARDS.map((card) => {
        const pos = organized ? ORGANIZED[card.id] : SCATTERED[card.id];
        const isMatch = matchedIds.has(card.id);
        const isDimmed = activeQuery !== null && !isMatch;
        return (
          <div
            key={card.id}
            className="absolute w-[132px] rounded-[var(--radius-md)] border bg-surface-2/90 p-2.5 shadow-lg backdrop-blur-sm transition-all duration-[1100ms] ease-out motion-reduce:transition-none sm:w-[148px]"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `rotate(${pos.rotate}deg) translateY(${isMatch ? -8 : 0}px)`,
              borderColor: isMatch ? card.color : "var(--border)",
              boxShadow: isMatch ? `0 0 0 1px ${card.color}66, 0 12px 24px -8px ${card.color}55` : undefined,
              opacity: isDimmed ? 0.35 : 1,
              zIndex: isMatch ? 20 : 10,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[10px] font-bold"
                style={{ backgroundColor: `${card.color}22`, color: card.color, border: `1px solid ${card.color}44` }}
              >
                {card.title.charAt(0)}
              </span>
              <p className="truncate text-[11px] font-medium text-text-primary">{card.title}</p>
            </div>
            <p className="mt-1 truncate font-mono text-[9px] text-text-muted">{card.domain}</p>
            {organized && <p className="mt-1 truncate text-[8.5px] text-text-secondary">{card.category}</p>}
          </div>
        );
      })}

      {/* The simulated search bar — floats above the cards, bottom-anchored */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[280px] rounded-[var(--radius-md)] border border-border-strong bg-surface/95 px-3 py-2.5 shadow-xl backdrop-blur-md sm:max-w-xs">
        <div className="flex items-center gap-2">
          <Search size={14} className="shrink-0 text-text-muted" />
          <span className="truncate font-mono text-[12px] text-text-primary">
            {displayedQuery || "What are you looking for?"}
            <span className="ml-0.5 inline-block h-[13px] w-[1.5px] animate-pulse bg-accent align-middle motion-reduce:hidden" />
          </span>
        </div>
      </div>
    </div>
  );
}
