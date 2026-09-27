"use client";

import { useEffect, type RefObject } from "react";

/**
 * Shared outside-click + Escape dismissal for any open action menu/popover
 * (mirrors the same pattern already used by src/components/ui/dropdown.tsx,
 * factored out so other menus — e.g. the resource detail action menu, Stack
 * Studio's canvas hover-actions — don't each reinvent it).
 */
export function useDismissableMenu(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
