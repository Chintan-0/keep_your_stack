"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const ICONS = ["📦", "🌐", "🤖", "⚙️", "🎨", "☁️", "🛠️", "🧪", "🔐", "📱", "🎮", "📊"];
const COLORS = [
  { key: "accent", swatch: "bg-accent" },
  { key: "violet", swatch: "bg-violet" },
  { key: "cyan", swatch: "bg-cyan" },
  { key: "success", swatch: "bg-success" },
  { key: "warning", swatch: "bg-warning" },
];

export function CreateStackModal() {
  const open = useUIStore((s) => s.createStackOpen);
  const onClose = useUIStore((s) => s.closeCreateStack);
  const addStack = useStore((s) => s.addStack);
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0].key);

  function reset() {
    setName("");
    setDescription("");
    setIcon(ICONS[0]);
    setColor(COLORS[0].key);
  }

  function save() {
    if (!name.trim()) {
      toast.error("Give your stack a name first.");
      return;
    }
    const stack = addStack({ name, description, icon, color });
    toast.success(`Created ${stack.name}`);
    reset();
    onClose();
    router.push(`/stacks/${stack.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      className="max-w-md"
      labelledBy="create-stack-title"
    >
      <ModalHeader title="Create Stack" subtitle="Group tools by where or how you use them." onClose={onClose} />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Stack name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SaaS Stack"
            className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Tools I use when building SaaS products."
            className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border text-[15px] cursor-pointer",
                  icon === i ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-text-secondary">Accent color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setColor(c.key)}
                className={cn(
                  "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-surface-2 cursor-pointer",
                  c.swatch,
                  color === c.key ? "ring-text-primary" : "ring-transparent"
                )}
                aria-label={c.key}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Create Stack</Button>
      </div>
    </Modal>
  );
}
