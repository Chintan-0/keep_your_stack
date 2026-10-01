"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus, FolderTree, Upload, Activity, ChevronRight } from "lucide-react";
import { useUIStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { SEMANTIC_COLOR_CLASSES, type SemanticColor } from "@/lib/colors";

function ActionRow({
  icon: Icon,
  label,
  color,
  onClick,
  href,
  shortcut,
}: {
  icon: React.ElementType;
  label: string;
  color: SemanticColor;
  onClick?: () => void;
  href?: string;
  shortcut?: string;
}) {
  const palette = SEMANTIC_COLOR_CLASSES[color];
  const content = (
    <>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]", palette.soft)}>
        <Icon size={14} className={palette.text} />
      </span>
      <span className="flex-1 truncate text-[13px] text-text-primary">{label}</span>
      {shortcut ? (
        <kbd className="kbd rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">{shortcut}</kbd>
      ) : (
        <ChevronRight size={14} className="shrink-0 text-text-muted" />
      )}
    </>
  );
  const className =
    "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors hover:bg-surface-3 cursor-pointer";
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

export function QuickActionsPanel() {
  const openAddResource = useUIStore((s) => s.openAddResource);
  const openCreateStack = useUIStore((s) => s.openCreateStack);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <h2 className="flex items-center gap-1.5 px-2 pb-1.5 text-[13px] font-semibold text-text-primary">
        <span aria-hidden="true">⚡</span> Quick Actions
      </h2>
      {/* "N" (no modifier) is the real shortcut — see keyboard-shortcuts.tsx,
          which explicitly ignores the event if any modifier key is held. */}
      <ActionRow icon={Plus} label="Add Resource" color="accent" onClick={() => openAddResource()} shortcut="N" />
      <ActionRow icon={FolderPlus} label="Create Stack" color="violet" onClick={openCreateStack} />
      <ActionRow icon={FolderTree} label="Manage Categories" color="orange" href="/settings/categories" />
      <ActionRow icon={Upload} label="Import Resources" color="cyan" href="/import" />
      <ActionRow icon={Activity} label="Library Health" color="success" onClick={() => router.push("/library")} />
    </div>
  );
}
