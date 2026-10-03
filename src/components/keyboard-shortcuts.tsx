"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/ui-store";

export function KeyboardShortcuts() {
  const router = useRouter();
  const openAddResource = useUIStore((s) => s.openAddResource);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const addResourceOpen = useUIStore((s) => s.addResourceOpen);
  const pendingG = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (commandPaletteOpen || addResourceOpen) return;
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendingG.current) {
        pendingG.current = false;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const key = e.key.toLowerCase();
        if (key === "r") {
          e.preventDefault();
          router.push("/resources");
        } else if (key === "s") {
          e.preventDefault();
          router.push("/stacks");
        } else if (key === "f") {
          e.preventDefault();
          router.push("/favorites");
        }
        return;
      }

      if (e.key.toLowerCase() === "g") {
        pendingG.current = true;
        timeoutRef.current = setTimeout(() => {
          pendingG.current = false;
        }, 900);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        openAddResource();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openAddResource, commandPaletteOpen, addResourceOpen]);

  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: ["⌘", "K"], label: "Search and jump anywhere" },
    { keys: ["N"], label: "Add a resource" },
    { keys: ["G", "R"], label: "Go to All Resources" },
    { keys: ["G", "S"], label: "Go to Stacks" },
    { keys: ["G", "F"], label: "Go to Favorites" },
    { keys: ["?"], label: "Show this list" },
  ];

  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} className="max-w-sm" labelledBy="shortcuts-title">
      <ModalHeader title="Keyboard shortcuts" onClose={() => setHelpOpen(false)} />
      <ul className="flex flex-col gap-1 p-3">
        {shortcuts.map((s) => (
          <li key={s.label} className="flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-secondary">
            {s.label}
            <span className="flex gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="kbd rounded border border-border-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-text-primary">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
