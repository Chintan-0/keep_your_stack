import { cn } from "@/lib/utils";

export function Tag({
  children,
  onClick,
  className,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono leading-4 transition-colors",
        active
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-border text-text-secondary bg-surface-2",
        onClick && "hover:border-border-strong hover:text-text-primary cursor-pointer",
        className
      )}
    >
      {children}
    </Comp>
  );
}
