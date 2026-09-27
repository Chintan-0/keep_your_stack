"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { suggestCategoryForResource } from "@/lib/enrichment";
import type { Resource, Category } from "@/lib/types";

interface Suggestion {
  categoryId: string;
  categoryName: string;
  resourceIds: string[];
}

/**
 * Preview-then-confirm auto-organize (§21): computes suggestions for
 * currently-uncategorized resources using the same deterministic signals
 * as ordinary import, shows exactly what would move where, and applies
 * nothing until the user confirms — either per group or all at once.
 */
export function AutoOrganizeModal({
  open,
  onClose,
  uncategorized,
  categories,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  uncategorized: Resource[];
  categories: Category[];
  onApply: (categoryId: string, resourceIds: string[]) => Promise<void>;
}) {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!open) return [];
    const byCategory = new Map<string, string[]>();
    for (const r of uncategorized) {
      const suggestion = suggestCategoryForResource(
        { title: r.title, description: r.description, domain: r.domain, folder: r.importFolder },
        categories
      );
      if (!suggestion || suggestion.confidence !== "high") continue;
      const list = byCategory.get(suggestion.categoryId) ?? [];
      list.push(r.id);
      byCategory.set(suggestion.categoryId, list);
    }
    return Array.from(byCategory.entries())
      .map(([categoryId, resourceIds]) => ({
        categoryId,
        categoryName: categories.find((c) => c.id === categoryId)?.name ?? "Unknown",
        resourceIds,
      }))
      .sort((a, b) => b.resourceIds.length - a.resourceIds.length);
  }, [open, uncategorized, categories]);

  const totalSuggested = suggestions.reduce((sum, s) => sum + s.resourceIds.length, 0);

  async function applyGroup(s: Suggestion) {
    setApplying(s.categoryId);
    try {
      await onApply(s.categoryId, s.resourceIds);
      setApplied((prev) => new Set(prev).add(s.categoryId));
    } catch {
      // store already toasted the error and rolled back
    } finally {
      setApplying(null);
    }
  }

  async function applyAll() {
    for (const s of suggestions) {
      if (applied.has(s.categoryId)) continue;
      await applyGroup(s);
    }
    toast.success("Auto-organize applied.");
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-lg" labelledBy="auto-organize-title">
      <ModalHeader title="Auto-organize" subtitle="Only resources we're confident about — review before applying." onClose={onClose} />
      <div className="max-h-[60vh] overflow-y-auto p-5">
        {uncategorized.length === 0 ? (
          <p className="text-[13px] text-text-secondary">Nothing uncategorized — your library is already organized.</p>
        ) : suggestions.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {uncategorized.length.toLocaleString()} resources are uncategorized, but none matched a category confidently
            enough to suggest automatically. Try the Review Queue or move them manually.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {suggestions.map((s) => {
              const done = applied.has(s.categoryId);
              return (
                <div
                  key={s.categoryId}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-text-primary">{s.categoryName}</p>
                    <p className="text-[11.5px] text-text-muted">
                      {s.resourceIds.length} resource{s.resourceIds.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    variant={done ? "ghost" : "secondary"}
                    size="sm"
                    disabled={done || applying === s.categoryId}
                    onClick={() => void applyGroup(s)}
                  >
                    {done ? "Moved" : applying === s.categoryId ? "Moving…" : "Move"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          <span className="font-mono text-[11px] text-text-muted">
            {totalSuggested} resource{totalSuggested === 1 ? "" : "s"} suggested
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void applyAll()} disabled={applying !== null}>
              <Sparkles size={13} /> Apply all
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
