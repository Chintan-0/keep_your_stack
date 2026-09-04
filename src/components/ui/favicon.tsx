import { faviconColor } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Favicon({ seed, size = 32, className }: { seed: string; size?: number; className?: string }) {
  const color = faviconColor(seed);
  return (
    <div
      className={cn("flex items-center justify-center rounded-[8px] font-semibold shrink-0", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {seed.charAt(0).toUpperCase()}
    </div>
  );
}
