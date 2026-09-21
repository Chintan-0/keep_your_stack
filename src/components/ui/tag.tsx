import { cn } from "@/lib/utils";
import { SEMANTIC_COLOR_CLASSES, type SemanticColor } from "@/lib/colors";

export function Tag({
  children,
  onClick,
  className,
  active,
  color,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  /**
   * Optional semantic accent (see src/lib/colors.ts — pass tagColor(name)
   * for a deterministic per-tag identity). Omit for the plain neutral
   * chip used in contexts where a colored tag would be too much (e.g.
   * dense list rows) — restrained by default, colorful where it helps.
   */
  color?: SemanticColor;
}) {
  const Comp = onClick ? "button" : "span";
  const palette = color ? SEMANTIC_COLOR_CLASSES[color] : null;
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono leading-4 transition-colors duration-150",
        active
          ? "border-accent/50 bg-accent-soft text-accent"
          : palette
            ? cn("border-transparent", palette.soft, palette.text)
            : "border-border text-text-secondary bg-surface-2",
        onClick && !active && "hover:border-border-strong hover:brightness-110 cursor-pointer",
        className
      )}
    >
      {children}
    </Comp>
  );
}
