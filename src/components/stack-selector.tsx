"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function StackSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const stacks = useStore((s) => s.stacks);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {stacks.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => toggle(s.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors cursor-pointer",
            value.includes(s.id)
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
          )}
        >
          <span>{s.icon}</span>
          {s.name}
        </button>
      ))}
    </div>
  );
}
