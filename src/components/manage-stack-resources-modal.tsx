"use client";

import { useMemo, useState } from "react";
import { Search, Check } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Favicon } from "@/components/ui/favicon";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ManageStackResourcesModal({
  stackId,
  open,
  onClose,
}: {
  stackId: string;
  open: boolean;
  onClose: () => void;
}) {
  const allResources = useStore((s) => s.resources);
  const resources = useMemo(() => allResources.filter((r) => !r.isArchived), [allResources]);
  const addResourceToStack = useStore((s) => s.addResourceToStack);
  const removeResourceFromStack = useStore((s) => s.removeResourceFromStack);
  const [query, setQuery] = useState("");

  const filtered = resources.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} className="max-w-md" labelledBy="manage-stack-title">
      <ModalHeader title="Manage Resources" subtitle="Add or remove resources from this stack." onClose={onClose} />
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resources…"
            className="h-8 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 pl-8 pr-2.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-2">
        {filtered.map((r) => {
          const inStack = r.stackIds.includes(stackId);
          return (
            <button
              key={r.id}
              onClick={() =>
                inStack ? removeResourceFromStack(r.id, stackId) : addResourceToStack(r.id, stackId)
              }
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left hover:bg-surface-3 cursor-pointer"
            >
              <Favicon seed={r.title} size={26} />
              <span className="flex-1 truncate text-[13px] text-text-primary">{r.title}</span>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  inStack ? "border-accent bg-accent text-white" : "border-border-strong text-transparent"
                )}
              >
                <Check size={12} />
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2.5 py-6 text-center text-[13px] text-text-secondary">No matching resources.</p>
        )}
      </div>
    </Modal>
  );
}
