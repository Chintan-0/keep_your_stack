"use client";

import { topLevelCategories, childCategories } from "@/lib/utils";

export function CategorySelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const tops = topLevelCategories();
  const parentOfValue = value
    ? tops.find((t) => childCategories(t.id).some((c) => c.id === value))?.id ?? value
    : "";

  return (
    <div className="flex gap-2">
      <select
        className="h-9 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
        value={parentOfValue}
        onChange={(e) => {
          const topId = e.target.value;
          if (!topId) {
            onChange(null);
            return;
          }
          const children = childCategories(topId);
          onChange(children.length ? null : topId);
        }}
      >
        <option value="">No category</option>
        {tops.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {parentOfValue && childCategories(parentOfValue).length > 0 && (
        <select
          className="h-9 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Choose subcategory</option>
          {childCategories(parentOfValue).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
