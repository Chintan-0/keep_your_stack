"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { StackSelector } from "@/components/stack-selector";
import { TagInput } from "@/components/tag-input";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import type { Resource } from "@/lib/types";

// Wrapper stays mounted; the form only mounts once we have a resource,
// so its fields can seed directly from that resource with no reset effect.
export function EditResourceModal() {
  const editResourceId = useUIStore((s) => s.editResourceId);
  const close = useUIStore((s) => s.closeEditResource);
  const resource = useStore((s) => s.resources.find((r) => r.id === editResourceId));

  return (
    <Modal open={!!editResourceId} onClose={close} className="max-w-xl" labelledBy="edit-resource-title">
      {resource && <EditResourceForm resource={resource} onClose={close} />}
    </Modal>
  );
}

function EditResourceForm({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const updateResource = useStore((s) => s.updateResource);
  const tags = useStore((s) => s.tags);

  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description);
  const [categoryId, setCategoryId] = useState<string | null>(resource.categoryId);
  const [tagNames, setTagNames] = useState<string[]>(
    resource.tagIds.map((id) => tags.find((t) => t.id === id)?.name ?? id)
  );
  const [stackIds, setStackIds] = useState<string[]>(resource.stackIds);
  const [notes, setNotes] = useState(resource.notes);

  function save() {
    updateResource(resource.id, {
      title: title.trim() || resource.domain,
      description,
      categoryId,
      tagNames,
      stackIds,
      notes,
    });
    toast.success("Resource updated");
    onClose();
  }

  return (
    <>
      <ModalHeader title="Edit Resource" subtitle={resource.domain} onClose={onClose} />
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        {/* Category gets its own full-width row rather than sharing a
            grid-cols-2 cell with Tags — CategorySelector can render up to
            two side-by-side controls (category + subcategory, or the
            inline "new subcategory" name input with its own Create/Cancel
            buttons), and a half-width cell was too narrow for that: the
            create-subcategory input's text and buttons visually overflowed
            into the Tags field next to it (confirmed live — the input's
            real value was always correct, but the Create button became
            very hard to hit reliably, which is exactly the kind of thing
            that reads as "category assignment doesn't work"). */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Category</label>
          <CategorySelector value={categoryId} onChange={setCategoryId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Tags</label>
          <TagInput value={tagNames} onChange={setTagNames} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Stack</label>
          <StackSelector value={stackIds} onChange={setStackIds} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Your note</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Save Changes</Button>
      </div>
    </>
  );
}
