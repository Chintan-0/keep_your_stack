"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Resource, Stack, Tag } from "./types";
import { buildResources, stacks as seedStacks, tags as seedTags } from "./mock-data";
import { normalizeUrl } from "./utils";

interface AddResourceInput {
  url: string;
  title?: string;
  description?: string;
  categoryId?: string | null;
  useCases?: string[];
  notes?: string;
  tagNames?: string[];
  stackIds?: string[];
  pricing?: Resource["pricing"];
  platform?: Resource["platform"];
}

interface StoreState {
  resources: Resource[];
  stacks: Stack[];
  tags: Tag[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  findByUrl: (url: string) => Resource | undefined;
  addResource: (
    input: AddResourceInput,
    opts?: { force?: boolean }
  ) => { resource: Resource; duplicate: boolean };
  updateResource: (id: string, patch: Partial<Resource>) => void;
  toggleFavorite: (id: string) => void;
  archiveResource: (id: string) => void;
  restoreResource: (id: string) => void;
  deleteResourcePermanently: (id: string) => void;

  addStack: (input: { name: string; description: string; icon: string; color: string }) => Stack;
  updateStack: (id: string, patch: Partial<Stack>) => void;
  deleteStack: (id: string) => void;
  addResourceToStack: (resourceId: string, stackId: string) => void;
  removeResourceFromStack: (resourceId: string, stackId: string) => void;

  ensureTags: (names: string[]) => string[];
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      resources: buildResources(),
      stacks: seedStacks,
      tags: seedTags,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      findByUrl: (url) => {
        const normalized = normalizeUrl(url);
        if (!normalized) return undefined;
        return get().resources.find((r) => normalizeUrl(r.url) === normalized);
      },

      ensureTags: (names) => {
        const existing = get().tags;
        const toAdd: Tag[] = [];
        const ids: string[] = [];
        for (const raw of names) {
          const name = raw.trim().toLowerCase();
          if (!name) continue;
          const id = slugify(name);
          ids.push(id);
          if (!existing.find((t) => t.id === id) && !toAdd.find((t) => t.id === id)) {
            toAdd.push({ id, name });
          }
        }
        if (toAdd.length) {
          set({ tags: [...existing, ...toAdd] });
        }
        return Array.from(new Set(ids));
      },

      addResource: (input, opts) => {
        const normalized = normalizeUrl(input.url);
        if (!normalized) {
          throw new Error("Invalid URL");
        }
        const existing = get().findByUrl(normalized);
        if (existing && !opts?.force) {
          return { resource: existing, duplicate: true };
        }
        const tagIds = input.tagNames ? get().ensureTags(input.tagNames) : [];
        const now = new Date().toISOString();
        let domain = normalized;
        try {
          domain = new URL(normalized).hostname.replace(/^www\./, "");
        } catch {
          /* noop */
        }
        const resource: Resource = {
          id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: input.title?.trim() || domain,
          url: normalized,
          domain,
          description: input.description?.trim() || "",
          faviconLetter: (input.title?.trim() || domain).charAt(0).toUpperCase(),
          categoryId: input.categoryId ?? null,
          useCases: input.useCases?.filter(Boolean) ?? [],
          notes: input.notes?.trim() || "",
          tagIds,
          stackIds: input.stackIds ?? [],
          pricing: input.pricing ?? null,
          platform: input.platform ?? null,
          isFavorite: false,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
          useCount: 0,
        };
        set({ resources: [resource, ...get().resources] });
        return { resource, duplicate: false };
      },

      updateResource: (id, patch) => {
        set({
          resources: get().resources.map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
          ),
        });
      },

      toggleFavorite: (id) => {
        set({
          resources: get().resources.map((r) =>
            r.id === id ? { ...r, isFavorite: !r.isFavorite } : r
          ),
        });
      },

      archiveResource: (id) => {
        set({
          resources: get().resources.map((r) => (r.id === id ? { ...r, isArchived: true } : r)),
        });
      },

      restoreResource: (id) => {
        set({
          resources: get().resources.map((r) => (r.id === id ? { ...r, isArchived: false } : r)),
        });
      },

      deleteResourcePermanently: (id) => {
        set({ resources: get().resources.filter((r) => r.id !== id) });
      },

      addStack: (input) => {
        const stack: Stack = {
          id: `stack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: input.name.trim(),
          description: input.description.trim(),
          icon: input.icon || "📦",
          color: input.color || "accent",
          createdAt: new Date().toISOString(),
        };
        set({ stacks: [...get().stacks, stack] });
        return stack;
      },

      updateStack: (id, patch) => {
        set({ stacks: get().stacks.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
      },

      deleteStack: (id) => {
        set({
          stacks: get().stacks.filter((s) => s.id !== id),
          resources: get().resources.map((r) => ({
            ...r,
            stackIds: r.stackIds.filter((sid) => sid !== id),
          })),
        });
      },

      addResourceToStack: (resourceId, stackId) => {
        set({
          resources: get().resources.map((r) =>
            r.id === resourceId && !r.stackIds.includes(stackId)
              ? { ...r, stackIds: [...r.stackIds, stackId] }
              : r
          ),
        });
      },

      removeResourceFromStack: (resourceId, stackId) => {
        set({
          resources: get().resources.map((r) =>
            r.id === resourceId
              ? { ...r, stackIds: r.stackIds.filter((sid) => sid !== stackId) }
              : r
          ),
        });
      },
    }),
    {
      name: "keepyourstack-storage",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
