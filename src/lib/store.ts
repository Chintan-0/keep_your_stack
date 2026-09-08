"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type { Category, Resource, Stack, Tag } from "./types";
import { normalizeUrl } from "./utils";

// Application-state layer, not the database: Supabase is the source of
// truth (see src/lib/data + src/app/api). This store just caches what the
// UI needs and reflects it optimistically — resources/stacks/tags are
// never persisted to localStorage here, so clearing site data can't lose
// anything real. (Small per-device preferences like theme still use
// localStorage — see src/lib/theme-store.ts — that's fine to keep local.)

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || "Something went wrong. Please try again.");
  }
  return body as T;
}

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
  faviconUrl?: string | null;
  imageUrl?: string | null;
}

interface UpdateResourcePatch {
  title?: string;
  description?: string;
  useCases?: string[];
  categoryId?: string | null;
  notes?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  pricing?: Resource["pricing"];
  platform?: Resource["platform"];
  tagNames?: string[];
  stackIds?: string[];
}

interface StoreState {
  resources: Resource[];
  stacks: Stack[];
  tags: Tag[];
  categories: Category[];
  hasHydrated: boolean;

  /** Fetches this user's resources/stacks/tags/categories from Supabase. Call once per session (on login / app mount). */
  hydrate: () => Promise<void>;
  /** Re-fetches just the tag list — call after a save that might have minted new tags. */
  refreshTags: () => Promise<void>;
  /** Re-fetches just the category list — call after creating one inline (e.g. during import). */
  refreshCategories: () => Promise<void>;

  addCategory: (input: { name: string; parentId?: string | null }) => Promise<Category>;
  /** Optimistic. */
  renameCategory: (id: string, name: string) => Promise<void>;
  /** Optimistic — moves a subcategory to another top-level category, or promotes it (parentId: null). */
  moveCategory: (id: string, parentId: string | null) => Promise<void>;
  reorderCategory: (id: string, direction: "up" | "down") => Promise<void>;
  /** Waits for server confirmation — never optimistic, since it can move resources and delete rows. */
  deleteCategory: (id: string, reassignTo: string | null) => Promise<{ movedResources: number; deletedSubcategories: number }>;
  /** Bulk "Move to" — one request, one local update. */
  bulkMoveResources: (resourceIds: string[], categoryId: string | null) => Promise<number>;
  /** Fetches the page and fills in description/Useful For/tags/category from real evidence — never overwrites a user edit. */
  enrichResource: (id: string) => Promise<Resource["enrichmentStatus"]>;

  findByUrl: (url: string) => Resource | undefined;
  addResource: (
    input: AddResourceInput,
    opts?: { force?: boolean }
  ) => Promise<{ resource: Resource; duplicate: boolean }>;
  /** Optimistic: updates local state immediately, persists in the background, reverts + toasts on failure. */
  updateResource: (id: string, patch: UpdateResourcePatch) => void;
  toggleFavorite: (id: string) => void;
  archiveResource: (id: string) => void;
  restoreResource: (id: string) => void;
  deleteResourcePermanently: (id: string) => void;

  addStack: (input: { name: string; description: string; icon: string; color: string }) => Promise<Stack>;
  updateStack: (id: string, patch: Partial<Stack>) => void;
  deleteStack: (id: string) => void;
  addResourceToStack: (resourceId: string, stackId: string) => void;
  removeResourceFromStack: (resourceId: string, stackId: string) => void;

  /** Seeds realistic sample resources/stacks into the (presumably empty) signed-in account. Never runs automatically. */
  loadDemoData: () => Promise<void>;
  /** Permanently deletes every resource/stack/tag this user has — the account itself stays. */
  clearAllData: () => Promise<void>;
}

export const useStore = create<StoreState>()((set, get) => ({
  resources: [],
  stacks: [],
  tags: [],
  categories: [],
  hasHydrated: false,

  hydrate: async () => {
    try {
      const [resourcesRes, stacksRes, tagsRes, categoriesRes] = await Promise.all([
        api<{ resources: Resource[] }>("/api/resources"),
        api<{ stacks: Stack[] }>("/api/stacks"),
        api<{ tags: Tag[] }>("/api/tags"),
        api<{ categories: Category[] }>("/api/categories"),
      ]);
      set({
        resources: resourcesRes.resources,
        stacks: stacksRes.stacks,
        tags: tagsRes.tags,
        categories: categoriesRes.categories,
        hasHydrated: true,
      });
    } catch {
      set({ hasHydrated: true });
      toast.error("Couldn't load your stack. Check your connection and reload.");
    }
  },

  refreshTags: async () => {
    try {
      const { tags } = await api<{ tags: Tag[] }>("/api/tags");
      set({ tags });
    } catch {
      // Non-critical — the next full hydrate will pick up any new tags.
    }
  },

  refreshCategories: async () => {
    try {
      const { categories } = await api<{ categories: Category[] }>("/api/categories");
      set({ categories });
    } catch {
      // Non-critical — the next full hydrate will pick up any new categories.
    }
  },

  findByUrl: (url) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return undefined;
    return get().resources.find((r) => normalizeUrl(r.url) === normalized);
  },

  addResource: async (input, opts) => {
    const { resource, duplicate } = await api<{ resource: Resource; duplicate: boolean }>("/api/resources", {
      method: "POST",
      body: JSON.stringify({ ...input, force: opts?.force }),
    });
    if (!duplicate) {
      set({ resources: [resource, ...get().resources] });
      if (input.tagNames?.length) void get().refreshTags();
    }
    return { resource, duplicate };
  },

  updateResource: (id, patch) => {
    const prev = get().resources;
    set({
      resources: prev.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
      ),
    });

    api<{ resource: Resource }>(`/api/resources/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then(() => {
        if (patch.tagNames?.length) void get().refreshTags();
      })
      .catch(() => {
        set({ resources: prev });
        toast.error("Couldn't save your changes. Try again.");
      });
  },

  toggleFavorite: (id) => {
    const current = get().resources.find((r) => r.id === id);
    if (!current) return;
    get().updateResource(id, { isFavorite: !current.isFavorite });
  },

  archiveResource: (id) => get().updateResource(id, { isArchived: true }),
  restoreResource: (id) => get().updateResource(id, { isArchived: false }),

  deleteResourcePermanently: (id) => {
    const prev = get().resources;
    set({ resources: prev.filter((r) => r.id !== id) });
    api(`/api/resources/${id}`, { method: "DELETE" }).catch(() => {
      set({ resources: prev });
      toast.error("Couldn't delete this resource. Try again.");
    });
  },

  addStack: async (input) => {
    const { stack } = await api<{ stack: Stack }>("/api/stacks", { method: "POST", body: JSON.stringify(input) });
    set({ stacks: [...get().stacks, stack] });
    return stack;
  },

  updateStack: (id, patch) => {
    const prev = get().stacks;
    set({ stacks: prev.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    api(`/api/stacks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => {
      set({ stacks: prev });
      toast.error("Couldn't update the stack. Try again.");
    });
  },

  deleteStack: (id) => {
    const prevStacks = get().stacks;
    const prevResources = get().resources;
    set({
      stacks: prevStacks.filter((s) => s.id !== id),
      resources: prevResources.map((r) => ({ ...r, stackIds: r.stackIds.filter((sid) => sid !== id) })),
    });
    api(`/api/stacks/${id}`, { method: "DELETE" }).catch(() => {
      set({ stacks: prevStacks, resources: prevResources });
      toast.error("Couldn't delete the stack. Try again.");
    });
  },

  addResourceToStack: (resourceId, stackId) => {
    const prev = get().resources;
    set({
      resources: prev.map((r) =>
        r.id === resourceId && !r.stackIds.includes(stackId) ? { ...r, stackIds: [...r.stackIds, stackId] } : r
      ),
    });
    api("/api/resource-stacks", { method: "POST", body: JSON.stringify({ resourceId, stackId }) }).catch(() => {
      set({ resources: prev });
      toast.error("Couldn't add to stack. Try again.");
    });
  },

  removeResourceFromStack: (resourceId, stackId) => {
    const prev = get().resources;
    set({
      resources: prev.map((r) =>
        r.id === resourceId ? { ...r, stackIds: r.stackIds.filter((sid) => sid !== stackId) } : r
      ),
    });
    api(`/api/resource-stacks?resourceId=${resourceId}&stackId=${stackId}`, { method: "DELETE" }).catch(() => {
      set({ resources: prev });
      toast.error("Couldn't remove from stack. Try again.");
    });
  },

  loadDemoData: async () => {
    await api("/api/demo-data", { method: "POST" });
    await get().hydrate();
  },

  clearAllData: async () => {
    await api("/api/clear-data", { method: "DELETE" });
    set({ resources: [], stacks: [], tags: [], categories: [] });
  },

  addCategory: async (input) => {
    const { category } = await api<{ category: Category }>("/api/categories", {
      method: "POST",
      body: JSON.stringify(input),
    });
    set({ categories: [...get().categories, category] });
    return category;
  },

  renameCategory: async (id, name) => {
    const prev = get().categories;
    set({ categories: prev.map((c) => (c.id === id ? { ...c, name } : c)) });
    try {
      await api(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    } catch (e) {
      set({ categories: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't rename the category. Try again.");
      throw e;
    }
  },

  moveCategory: async (id, parentId) => {
    const prev = get().categories;
    set({ categories: prev.map((c) => (c.id === id ? { ...c, parentId } : c)) });
    try {
      await api(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ parentId }) });
    } catch (e) {
      set({ categories: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't move the category. Try again.");
      throw e;
    }
  },

  reorderCategory: async (id, direction) => {
    const prev = get().categories;
    try {
      await api(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ reorder: direction }) });
      await get().refreshCategories();
    } catch (e) {
      set({ categories: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't reorder categories. Try again.");
      throw e;
    }
  },

  deleteCategory: async (id, reassignTo) => {
    const result = await api<{ movedResources: number; deletedSubcategories: number }>(
      `/api/categories/${id}?reassignTo=${reassignTo ?? "none"}`,
      { method: "DELETE" }
    );
    // Not optimistic (see the interface note) — refetch both since
    // resources may have moved and subcategories may be gone.
    await Promise.all([get().refreshCategories(), get().hydrate()]);
    return result;
  },

  bulkMoveResources: async (resourceIds, categoryId) => {
    const prev = get().resources;
    set({
      resources: prev.map((r) => (resourceIds.includes(r.id) ? { ...r, categoryId } : r)),
    });
    try {
      const { moved } = await api<{ moved: number }>("/api/resources/bulk-move", {
        method: "POST",
        body: JSON.stringify({ resourceIds, categoryId }),
      });
      return moved;
    } catch (e) {
      set({ resources: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't move those resources. Try again.");
      throw e;
    }
  },

  enrichResource: async (id) => {
    const { resource, status } = await api<{ resource: Resource; status: Resource["enrichmentStatus"] }>(
      `/api/resources/${id}/enrich`,
      { method: "POST" }
    );
    set({ resources: get().resources.map((r) => (r.id === id ? resource : r)) });
    if (resource.tagIds.length) void get().refreshTags();
    return status;
  },
}));
