"use client";

import { AlertTriangle } from "lucide-react";
import { KysLoader } from "./kys-loader";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export type LoadingPhase = "starting" | "loading" | "finalizing" | "error";

/**
 * The glassmorphic overlay for genuinely blocking operations (Phase 15.7
 * §3.3) — a real bookmark import, not Stack Studio's background library
 * page-in (that stays a small non-blocking pill; the canvas itself is
 * usable the whole time, see studio-canvas.tsx). Reserved for operations
 * that actually need the user to wait, never applied just for visual
 * effect.
 *
 * Progress is only ever what the caller passes in — this component has no
 * internal timer or fake-progress logic. `current`/`total` must come from
 * the real operation.
 */
export function LoadingOverlay({
  open,
  fixed = false,
  title,
  phase = "loading",
  current,
  total,
  detail,
  errorMessage,
  onRetry,
}: {
  open: boolean;
  /** `fixed` covers the whole viewport; the default (absolute) covers only the nearest positioned ancestor — use that to avoid blocking parts of the UI that don't need it. */
  fixed?: boolean;
  title: string;
  phase?: LoadingPhase;
  current?: number;
  total?: number;
  detail?: string;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  if (!open) return null;

  const pct = total && total > 0 && typeof current === "number" ? Math.min(100, Math.round((current / total) * 100)) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "z-50 flex items-center justify-center p-6",
        fixed ? "fixed inset-0" : "absolute inset-0"
      )}
    >
      {/* Translucent, blurred backdrop — background content stays subtly
          visible rather than being replaced by a blank screen (§3.13). */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border-strong bg-surface-2/80 px-6 py-7 text-center shadow-2xl shadow-black/20 backdrop-blur-xl">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)]"
          style={{ boxShadow: "0 0 40px -12px var(--accent-soft)" }}
        />
        {phase === "error" ? (
          <>
            <AlertTriangle size={28} className="text-danger" />
            <p className="text-[14px] font-medium text-text-primary">{errorMessage || "Something went wrong."}</p>
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
          </>
        ) : (
          <>
            <KysLoader size="lg" />
            <p className="text-[14.5px] font-medium text-text-primary">{title}</p>
            {pct !== null && (
              <>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="font-mono text-[12px] text-text-muted">
                  {current!.toLocaleString()} / {total!.toLocaleString()}
                </p>
              </>
            )}
            {detail && <p className="text-[12px] text-text-secondary">{detail}</p>}
          </>
        )}
      </div>
    </div>
  );
}
