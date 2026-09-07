"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { topLevelCategories, childCategories } from "@/lib/utils";
import { Dropdown } from "@/components/ui/dropdown";

const CREATE_NEW = "__create__";

function InlineCreate({
  placeholder,
  onCreate,
  onCancel,
}: {
  placeholder: string;
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await onCreate(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="h-9 flex-1 rounded-[var(--radius-sm)] border border-accent bg-surface-3 px-2.5 text-[13px] text-text-primary placeholder-text-muted focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void commit()}
        disabled={saving}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-white disabled:opacity-50 cursor-pointer"
        aria-label="Create"
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong text-text-secondary hover:text-text-primary cursor-pointer"
        aria-label="Cancel"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function CategorySelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const categories = useStore((s) => s.categories);
  const addCategory = useStore((s) => s.addCategory);
  const tops = topLevelCategories(categories);

  // `value` alone is enough to know both levels: if it points at a
  // top-level row, the category is set with no subcategory yet (a fully
  // valid, non-forced state); if it points at a row with a parent, that
  // parent is the category and `value` itself is the subcategory. Picking
  // a top-level category with children commits it immediately — the
  // subcategory dropdown that then appears is a refinement, never a
  // requirement to actually save something.
  const current = value ? categories.find((c) => c.id === value) : null;
  const parentId = current ? (current.parentId ?? current.id) : null;

  // While creating a brand-new top-level category, there's a moment where
  // it exists but `value` hasn't been set to it yet (the caller's state
  // update happens after this async call returns) — track it locally so
  // the subcategory picker still appears right away instead of flashing
  // closed for a render.
  const [justCreatedParent, setJustCreatedParent] = useState<string | null>(null);
  const effectiveParentId = parentId ?? justCreatedParent;

  const [creatingTop, setCreatingTop] = useState(false);
  const [creatingSub, setCreatingSub] = useState(false);

  const children = effectiveParentId ? childCategories(categories, effectiveParentId) : [];
  const subcategoryValue = current?.parentId ? current.id : "";

  async function createTop(name: string) {
    try {
      const created = await addCategory({ name, parentId: null });
      setCreatingTop(false);
      setJustCreatedParent(created.id);
      onChange(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the category.");
    }
  }

  async function createSub(name: string) {
    if (!effectiveParentId) return;
    try {
      const created = await addCategory({ name, parentId: effectiveParentId });
      setCreatingSub(false);
      onChange(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the subcategory.");
    }
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        {creatingTop ? (
          <InlineCreate placeholder="New category name" onCreate={createTop} onCancel={() => setCreatingTop(false)} />
        ) : (
          <Dropdown
            value={effectiveParentId ?? ""}
            onChange={(topId) => {
              if (topId === CREATE_NEW) {
                setCreatingTop(true);
                return;
              }
              setJustCreatedParent(null);
              onChange(topId || null);
            }}
            placeholder="No category"
            options={[
              { value: "", label: "No category" },
              ...tops.map((t) => ({ value: t.id, label: t.name })),
              { value: CREATE_NEW, label: "+ Create category" },
            ]}
          />
        )}
      </div>
      {effectiveParentId &&
        (children.length > 0 || creatingSub ? (
          <div className="flex-1">
            {creatingSub ? (
              <InlineCreate placeholder="New subcategory name" onCreate={createSub} onCancel={() => setCreatingSub(false)} />
            ) : (
              <Dropdown
                value={subcategoryValue}
                onChange={(v) => {
                  if (v === CREATE_NEW) {
                    setCreatingSub(true);
                    return;
                  }
                  // Empty selection means "this category, no subcategory" —
                  // falls back to the parent, never all the way to null.
                  onChange(v || effectiveParentId);
                }}
                placeholder="Category only"
                options={[
                  { value: "", label: "Category only (no subcategory)" },
                  ...children.map((c) => ({ value: c.id, label: c.name })),
                  { value: CREATE_NEW, label: "+ Create subcategory" },
                ]}
              />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingSub(true)}
            className="flex h-9 flex-1 items-center rounded-[var(--radius-sm)] border border-dashed border-border-strong px-2.5 text-left text-[12.5px] text-text-muted transition-colors hover:border-accent hover:text-accent cursor-pointer"
          >
            + Add subcategory
          </button>
        ))}
    </div>
  );
}
