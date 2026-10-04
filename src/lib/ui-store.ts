"use client";

import { create } from "zustand";

export const SIDEBAR_STORAGE_KEY = "kys-sidebar-collapsed";

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

// Same idea, for the resource quick-view modal — captured at the moment a
// card's body is clicked/activated, so closing the modal (Escape, backdrop,
// the X) can restore focus to that exact card rather than dropping it back
// to the top of the document.
let elementBeforeQuickView: HTMLElement | null = null;
export function getElementBeforeQuickView(): HTMLElement | null {
  return elementBeforeQuickView;
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

  shareResourceId: string | null;
  openShareResource: (id: string) => void;
  closeShareResource: () => void;

  quickViewResourceId: string | null;
  openQuickView: (id: string) => void;
  closeQuickView: () => void;

  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
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

  shareResourceId: null,
  openShareResource: (id) => set({ shareResourceId: id }),
  closeShareResource: () => set({ shareResourceId: null }),

  quickViewResourceId: null,
  openQuickView: (id) => {
    if (typeof document !== "undefined") {
      elementBeforeQuickView = document.activeElement as HTMLElement;
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "resource_quick_view_opened", metadata: { resourceId: id } }),
      }).catch(() => {});
    }
    set({ quickViewResourceId: id });
  },
  closeQuickView: () => set({ quickViewResourceId: null }),

  mobileNavOpen: false,
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, v ? "1" : "0");
    } catch {}
    set({ sidebarCollapsed: v });
  },
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),

  createStackOpen: false,
  openCreateStack: () => set({ createStackOpen: true }),
  closeCreateStack: () => set({ createStackOpen: false }),

  feedbackOpen: false,
  openFeedback: () => set({ feedbackOpen: true }),
  closeFeedback: () => set({ feedbackOpen: false }),
}));
