"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist((set) => ({ theme: "dark", setTheme: (t) => set({ theme: t }) }), {
    name: "keepyourstack-theme",
  })
);
