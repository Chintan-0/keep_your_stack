import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: { box: 20, cardW: 11, cardH: 8 },
  md: { box: 40, cardW: 22, cardH: 16 },
  lg: { box: 56, cardW: 30, cardH: 22 },
} as const;

/**
 * The KeepYourStack loading indicator — three small translucent cards that
 * settle into an aligned stack, looping. Meant to read as "your toolbox is
 * being put together," not a generic spinner (Phase 15.7 §3.1). Pure CSS
 * keyframes (transform + opacity only, no layout-affecting properties) so
 * it's cheap regardless of how many are on screen at once, and respects
 * prefers-reduced-motion via globals.css (falls back to a static aligned
 * stack, no motion).
 */
export function KysLoader({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = SIZE_MAP[size];
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("kys-loader relative inline-block shrink-0", className)}
      style={{ width: dims.box, height: dims.box }}
    >
      {(["violet", "blue", "cyan"] as const).map((color, i) => (
        <span
          key={color}
          className={cn("kys-loader-card", `kys-loader-card-${i + 1}`)}
          style={{
            width: dims.cardW,
            height: dims.cardH,
            marginLeft: -dims.cardW / 2,
            marginTop: -dims.cardH / 2,
            background: `var(--${color}-soft)`,
            borderColor: `var(--${color})`,
          }}
        />
      ))}
    </div>
  );
}
