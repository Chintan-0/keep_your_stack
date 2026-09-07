"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronUp, ChevronDown, Pencil, Plus, Trash2, FolderTree, ArrowRightLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { topLevelCategories, childCategories, cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function InlineCreate({ placeholder, onCreate, onCancel }: { placeholder: string; onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (name.trim()) onCreate(name.trim());
            else onCancel();
          } else if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="h-8 flex-1 rounded-[var(--radius-sm)] border border-accent bg-surface-3 px-2.5 text-[13px] text-text-primary placeholder-text-muted focus:outline-none"
      />
      <button
        onClick={() => (name.trim() ? onCreate(name.trim()) : onCancel())}
        className="text-[12px] font-medium text-accent hover:text-accent-hover cursor-pointer"
      >
        Create
      </button>
      <button onClick={onCancel} className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer">
        Cancel
      </button>
    </div>
  );
}

function CategoryRow({
  category,
  count,
  isChild,
  moveOptions,
}: {
  category: Category;
  count: number;
  isChild: boolean;
  moveOptions: { value: string; label: string }[];
}) {
  const renameCategory = useStore((s) => s.renameCategory);
  const moveCategory = useStore((s) => s.moveCategory);
  const reorderCategory = useStore((s) => s.reorderCategory);
  const deleteCategoryAction = useStore((s) => s.deleteCategory);
  const categories = useStore((s) => s.categories);
  const resources = useStore((s) => s.resources);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("none");

  const childIds = childCategories(categories, category.id).map((c) => c.id);
  const affectedCount =
    count + resources.filter((r) => r.categoryId && childIds.includes(r.categoryId)).length;
  const subcatCount = childIds.length;

  const reassignOptions = [
    { value: "none", label: "No category" },
    ...categories
      .filter((c) => c.id !== category.id && !childIds.includes(c.id))
      .map((c) => ({ value: c.id, label: c.parentId ? `↳ ${c.name}` : c.name })),
  ];

  async function commitRename() {
    setEditing(false);
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === category.name) return;
    try {
      await renameCategory(category.id, trimmed);
    } catch {
      // store already toasted
    }
  }

  async function handleDelete() {
    try {
      const result = await deleteCategoryAction(category.id, reassignTo === "none" ? null : reassignTo);
      toast.success(
        result.movedResources > 0
          ? `Deleted "${category.name}" — ${result.movedResources} resource${result.movedResources === 1 ? "" : "s"} reassigned.`
          : `Deleted "${category.name}".`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete this category.");
      throw e; // keep the confirm dialog open so the user can retry
    }
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 hover:bg-surface-3",
          isChild && "ml-6"
        )}
      >
        {isChild && <span className="text-text-muted">›</span>}
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftName(category.name);
                setEditing(false);
              }
            }}
            className="h-7 flex-1 rounded-[var(--radius-sm)] border border-accent bg-surface-3 px-2 text-[13px] text-text-primary focus:outline-none"
          />
        ) : (
          <span className={cn("flex-1 text-[13px]", isChild ? "text-text-secondary" : "font-medium text-text-primary")}>
            {category.name}
          </span>
        )}
        <span className="font-mono text-[11px] text-text-muted">
          {count}
          {subcatCount > 0 && !isChild ? ` · ${subcatCount} sub` : ""}
        </span>

        <div className="flex items-center gap-0.5 text-text-muted">
          <button onClick={() => void reorderCategory(category.id, "up")} className="rounded p-1 hover:bg-surface-hover hover:text-text-primary cursor-pointer" aria-label="Move up">
            <ChevronUp size={14} />
          </button>
          <button onClick={() => void reorderCategory(category.id, "down")} className="rounded p-1 hover:bg-surface-hover hover:text-text-primary cursor-pointer" aria-label="Move down">
            <ChevronDown size={14} />
          </button>
          <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-surface-hover hover:text-text-primary cursor-pointer" aria-label="Rename">
            <Pencil size={13} />
          </button>
          {isChild && (
            <div className="w-36">
              <Dropdown
                size="sm"
                value={category.parentId ?? ""}
                onChange={(v) => void moveCategory(category.id, v || null)}
                options={moveOptions}
              />
            </div>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1 text-danger/70 hover:bg-danger-soft hover:text-danger cursor-pointer"
            aria-label="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={`Delete "${category.name}"?`}
        description={
          affectedCount > 0 || subcatCount > 0
            ? `${category.name} contains ${affectedCount} resource${affectedCount === 1 ? "" : "s"}${
                subcatCount > 0 ? ` and ${subcatCount} subcategor${subcatCount === 1 ? "y" : "ies"}` : ""
              }. Choose where its resources go below, then delete.`
            : "This category is empty — deleting it won't affect any resources."
        }
        confirmLabel="Delete"
        danger
      >
        {(affectedCount > 0 || subcatCount > 0) && (
          <div className="flex flex-col gap-1.5 pt-1">
            <label className="text-[11.5px] font-medium text-text-secondary">Move affected resources to</label>
            <Dropdown value={reassignTo} onChange={setReassignTo} options={reassignOptions} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

export default function CategoriesSettingsPage() {
  const categories = useStore((s) => s.categories);
  const resources = useStore((s) => s.resources);
  const addCategory = useStore((s) => s.addCategory);
  const [creatingTop, setCreatingTop] = useState(false);
  const [creatingSubFor, setCreatingSubFor] = useState<string | null>(null);

  const tops = topLevelCategories(categories);

  const countFor = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) {
      if (r.categoryId) map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + 1);
    }
    return map;
  }, [resources]);

  async function handleCreateTop(name: string) {
    try {
      await addCategory({ name, parentId: null });
      setCreatingTop(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the category.");
    }
  }

  async function handleCreateSub(parentId: string, name: string) {
    try {
      await addCategory({ name, parentId });
      setCreatingSubFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the subcategory.");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/settings" className="flex w-fit items-center gap-1 text-[12.5px] text-text-secondary hover:text-text-primary cursor-pointer">
        <ChevronLeft size={14} /> Settings
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <FolderTree size={19} /> Categories
        </h1>
        <p className="text-[13px] text-text-secondary">
          Fully yours — create, rename, reorder, move, or delete categories and subcategories any time. Deleting one
          never deletes its resources.
        </p>
      </div>

      <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        {tops.length === 0 && !creatingTop && (
          <p className="px-2.5 py-4 text-center text-[13px] text-text-muted">No categories yet.</p>
        )}
        {tops.map((top) => {
          const children = childCategories(categories, top.id);
          const moveOptions = [
            ...tops.filter((t) => t.id !== top.id).map((t) => ({ value: t.id, label: t.name })),
          ];
          return (
            <div key={top.id} className="flex flex-col gap-0.5">
              <CategoryRow category={top} count={countFor.get(top.id) ?? 0} isChild={false} moveOptions={[]} />
              {children.map((child) => (
                <CategoryRow
                  key={child.id}
                  category={child}
                  count={countFor.get(child.id) ?? 0}
                  isChild
                  moveOptions={moveOptions}
                />
              ))}
              {creatingSubFor === top.id ? (
                <div className="ml-8 py-1">
                  <InlineCreate
                    placeholder="Subcategory name"
                    onCreate={(name) => void handleCreateSub(top.id, name)}
                    onCancel={() => setCreatingSubFor(null)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setCreatingSubFor(top.id)}
                  className="ml-8 flex w-fit items-center gap-1 py-1 text-[11.5px] text-text-muted hover:text-accent cursor-pointer"
                >
                  <Plus size={12} /> Add subcategory
                </button>
              )}
            </div>
          );
        })}

        <div className="mt-2 border-t border-border pt-3">
          {creatingTop ? (
            <InlineCreate placeholder="Category name" onCreate={(name) => void handleCreateTop(name)} onCancel={() => setCreatingTop(false)} />
          ) : (
            <button
              onClick={() => setCreatingTop(true)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-hover cursor-pointer"
            >
              <Plus size={14} /> New Category
            </button>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11.5px] text-text-muted">
        <ArrowRightLeft size={12} /> Use the small dropdown next to a subcategory to move it under a different category.
      </p>
    </div>
  );
}
