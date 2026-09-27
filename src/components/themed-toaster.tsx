"use client";

import { Toaster } from "sonner";
import { useThemeStore } from "@/lib/theme-store";

/**
 * Sonner's own `theme` prop natively supports "light"/"dark"/"system"
 * (it listens to prefers-color-scheme itself for "system") — this just
 * keeps it in sync with the user's actual choice instead of being
 * hardcoded to "dark" regardless of theme (Phase 15.7 §14/§33).
 */
export function ThemedToaster() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-primary)",
          fontSize: "13px",
        },
      }}
    />
  );
}
