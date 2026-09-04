"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/lib/theme-store";

export function ThemeProvider() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    const isDark =
      theme === "dark" || (theme === "system" && !window.matchMedia("(prefers-color-scheme: light)").matches);
    root.classList.toggle("dark", isDark);
  }, [theme]);

  return null;
}
