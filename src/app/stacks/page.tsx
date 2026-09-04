"use client";

import { useMemo, useState } from "react";
import { Plus, Layers } from "lucide-react";
import { useStore } from "@/lib/store";
import { StackCard } from "@/components/stack-card";
import { CreateStackModal } from "@/components/create-stack-modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function StacksPage() {
  const stacks = useStore((s) => s.stacks);
  const storeResources = useStore((s) => s.resources);
  const resources = useMemo(() => storeResources.filter((r) => !r.isArchived), [storeResources]);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Stacks</h1>
          <p className="text-[13px] text-text-secondary">Where and how you use the tools you save.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Create Stack
        </Button>
      </div>

      {stacks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Build your first stack."
          description="Group the tools you use for a specific workflow."
          action={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus size={14} /> Create Stack
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stacks.map((s) => (
            <StackCard key={s.id} stack={s} count={resources.filter((r) => r.stackIds.includes(s.id)).length} />
          ))}
        </div>
      )}

      <CreateStackModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
