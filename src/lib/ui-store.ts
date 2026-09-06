"use client";

import { create } from "zustand";

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
}

export const useUIStore = create<UIState>((set) => ({
  addResourceOpen: false,
  addResourcePrefillUrl: "",
  openAddResource: (prefillUrl = "") => set({ addResourceOpen: true, addResourcePrefillUrl: prefillUrl }),
  closeAddResource: () => set({ addResourceOpen: false, addResourcePrefillUrl: "" }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  editResourceId: null,
  openEditResource: (id) => set({ editResourceId: id }),
  closeEditResource: () => set({ editResourceId: null }),

  mobileNavOpen: false,
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),

  createStackOpen: false,
  openCreateStack: () => set({ createStackOpen: true }),
  closeCreateStack: () => set({ createStackOpen: false }),
}));
