import { cn } from "@/lib/utils";

/**
 * The small pill-shaped "N items need attention" button — was duplicated
 * verbatim (same recipe, different label) between Stack Studio's canvas
 * toolbar and its legacy review board.
 */
export function WarningBadge({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[12px] font-medium text-warning cursor-pointer",
        className
      )}
    >
      {children}
    </button>
  );
}
