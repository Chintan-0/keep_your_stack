"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const allTags = useStore((s) => s.tags);

  function commit(raw: string) {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    if (!value.includes(name)) onChange([...value, name]);
    setDraft("");
  }

  const suggestions = allTags
    .filter((t) => t.name.includes(draft.toLowerCase()) && draft && !value.includes(t.name))
    .slice(0, 5);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 py-1.5 focus-within:border-accent">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 font-mono text-[11px] text-text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-text-muted hover:text-danger cursor-pointer"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={value.length ? "" : "webp, images, optimization..."}
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-[13px] text-text-primary placeholder-text-muted focus:outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => commit(s.name)}
              className="block w-full px-2.5 py-1.5 text-left font-mono text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-primary cursor-pointer"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
