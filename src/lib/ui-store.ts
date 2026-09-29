"use client";

import { create } from "zustand";

// Plain module state, not part of the reactive store — this only needs
// to survive between "open" and the matching "close," never trigger a
// re-render, and must be captured at the exact moment open is requested
// (the command palette's own click-trigger and its Cmd+K keydown handler
// are two separate call sites, so the store action is the one place both
// funnel through before focus moves into the dialog).
let elementBeforeCommandPalette: HTMLElement | null = null;
export function getElementBeforeCommandPalette(): HTMLElement | null {
  return elementBeforeCommandPalette;
}

interface UIState {
  addResourceOpen: boolean;
  addResourcePrefillUrl: string;
  openAddResource: (prefillUrl?: string) => void;
  closeAddResource: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;

  editResourceId: string | null;
  openEditResource: (id: string) => void;
  closeEditResource: () => void;

  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;

  createStackOpen: boolean;
  openCreateStack: () => void;
  closeCreateStack: () => void;

  feedbackOpen: boolean;
  openFeedback: () => void;
  closeFeedback: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  addResourceOpen: false,
  addResourcePrefillUrl: "",
  openAddResource: (prefillUrl = "") => set({ addResourceOpen: true, addResourcePrefillUrl: prefillUrl }),
  closeAddResource: () => set({ addResourceOpen: false, addResourcePrefillUrl: "" }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => {
    if (v && !get().commandPaletteOpen && typeof document !== "undefined") {
      elementBeforeCommandPalette = document.activeElement as HTMLElement;
    }
    set({ commandPaletteOpen: v });
  },

  editResourceId: null,
  openEditResource: (id) => set({ editResourceId: id }),
  closeEditResource: () => set({ editResourceId: null }),

  mobileNavOpen: false,
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),

  createStackOpen: false,
  openCreateStack: () => set({ createStackOpen: true }),
  closeCreateStack: () => set({ createStackOpen: false }),

  feedbackOpen: false,
  openFeedback: () => set({ feedbackOpen: true }),
  closeFeedback: () => set({ feedbackOpen: false }),
}));
