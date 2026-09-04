"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/ui-store";

export function KeyboardShortcuts() {
  const router = useRouter();
  const openAddResource = useUIStore((s) => s.openAddResource);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const addResourceOpen = useUIStore((s) => s.addResourceOpen);
  const pendingG = useRef(false);
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

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        openAddResource();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openAddResource, commandPaletteOpen, addResourceOpen]);

  return null;
}
