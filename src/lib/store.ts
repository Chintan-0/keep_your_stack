"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type { Category, LinkHealth, Resource, Stack, Tag } from "./types";

export interface ResourceStats {
  total: number;
  favorites: number;
  addedRecently: number;
}

const RESOURCES_PAGE_SIZE = 300;
import { normalizeUrl, getDomain } from "./utils";

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
  url?: string;
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
  needsReviewDismissed?: boolean;
}

interface StoreState {
  resources: Resource[];
  stacks: Stack[];
  tags: Tag[];
  categories: Category[];
  hasHydrated: boolean;

  /**
   * Dashboard stat counts (total/favorites/added-recently), fetched via 3
   * cheap indexed queries — never derived from `resources`, which after
   * pagination is only a prefix of the real library and would undercount.
   * Null until the first hydrate/refresh completes.
   */
  stats: ResourceStats | null;
  /** True once `resources` holds every resource the account has (initial page filled everything, or loadMoreResources reached the end). */
  resourcesHasMore: boolean;
  resourcesLoadingMore: boolean;

  /** Fetches this user's first page of resources + stacks/tags/categories/stats from Supabase. Call once per session (on login / app mount). */
  hydrate: () => Promise<void>;
  /** Fetches the next page of resources and appends it — used by "Load more" on All Resources/Favorites/Archive once a filtered view runs out of already-loaded matches. */
  loadMoreResources: () => Promise<void>;
  /** Re-fetches just the 3 dashboard counts — call after anything that changes total/favorite/archived counts, cheaper than a full hydrate. */
  refreshStats: () => Promise<void>;
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
  /** Adds every resource to a stack in one batched request. */
  bulkAddToStack: (resourceIds: string[], stackId: string) => Promise<number>;
  /** Adds tag(s) to every resource in one batched request (creates any new tags via the existing ensureTags path). */
  bulkAddTags: (resourceIds: string[], tagNames: string[]) => Promise<number>;
  /** Archives or restores every resource in one batched request. */
  bulkArchiveResources: (resourceIds: string[], archived: boolean) => Promise<number>;
  /** Fetches the page and fills in description/Useful For/tags/category from real evidence — never overwrites a user edit. */
  enrichResource: (id: string) => Promise<Resource["enrichmentStatus"]>;

  findByUrl: (url: string) => Resource | undefined;
  /**
   * Resource Detail can be reached directly (a bookmark, a link from
   * search) for a resource older than whatever's been paginated into
   * `resources` — fetches it individually and merges it in rather than
   * that page wrongly treating it as not found. No-ops if already loaded.
   * Returns false only when the resource genuinely doesn't exist/isn't
   * this user's.
   */
  ensureResourceLoaded: (id: string) => Promise<boolean>;
  /** Same idea as ensureResourceLoaded, but for every member of one stack at once — call when opening Stack Detail. */
  ensureStackResourcesLoaded: (stackId: string) => Promise<void>;
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

  linkChecks: Record<string, LinkHealth>;
  /** Re-fetches link health for every resource — call after a recheck batch, or on demand. */
  refreshLinkChecks: () => Promise<void>;
  /** Checks one resource's URL now (SSRF-guarded server-side) and stores the result. */
  checkResourceLink: (id: string) => Promise<LinkHealth>;
  /** Checks a batch (explicit ids, or a server-chosen priority batch when omitted). */
  recheckLibrary: (resourceIds?: string[]) => Promise<{ checked: number }>;
  /** Merges `loserId` into `keeperId` (union tags/stacks, prefer user-owned fields, preserve notes/favorite) and deletes the loser. */
  mergeResources: (keeperId: string, loserId: string) => Promise<Resource>;
  /** Hides a resource from Needs Review until it's next edited or its link is rechecked. */
  dismissNeedsReview: (id: string) => void;
}

export const useStore = create<StoreState>()((set, get) => ({
  resources: [],
  stacks: [],
  tags: [],
  categories: [],
  linkChecks: {},
  hasHydrated: false,
  stats: null,
  resourcesHasMore: false,
  resourcesLoadingMore: false,

  // Fetches only the first RESOURCES_PAGE_SIZE resources (newest first) up
  // front, not the whole library — the rest loads on demand via
  // loadMoreResources(). Stacks/tags/categories/link-checks stay a full
  // fetch (they're small — a personal toolbox has dozens of those, not
  // thousands). Dashboard counts come from the separate, cheap `stats`
  // query instead of being derived from however much of `resources` has
  // loaded, which would undercount past the first page.
  hydrate: async () => {
    try {
      const [resourcesPage, stacksRes, tagsRes, categoriesRes, linkChecksRes, stats] = await Promise.all([
        api<{ resources: Resource[]; total: number; hasMore: boolean }>(
          `/api/resources?limit=${RESOURCES_PAGE_SIZE}`
        ),
        api<{ stacks: Stack[] }>("/api/stacks"),
        api<{ tags: Tag[] }>("/api/tags"),
        api<{ categories: Category[] }>("/api/categories"),
        api<{ linkChecks: Record<string, LinkHealth> }>("/api/library/link-checks").catch(() => ({ linkChecks: {} })),
        api<{ stats: ResourceStats }>("/api/resources/stats").catch(() => ({ stats: null as ResourceStats | null })),
      ]);
      set({
        resources: resourcesPage.resources,
        resourcesHasMore: resourcesPage.hasMore,
        stacks: stacksRes.stacks,
        tags: tagsRes.tags,
        categories: categoriesRes.categories,
        linkChecks: linkChecksRes.linkChecks,
        stats: stats.stats,
        hasHydrated: true,
      });
    } catch {
      set({ hasHydrated: true });
      toast.error("Couldn't load your stack. Check your connection and reload.");
    }
  },

  loadMoreResources: async () => {
    if (get().resourcesLoadingMore || !get().resourcesHasMore) return;
    set({ resourcesLoadingMore: true });
    try {
      const offset = get().resources.length;
      const page = await api<{ resources: Resource[]; total: number; hasMore: boolean }>(
        `/api/resources?limit=${RESOURCES_PAGE_SIZE}&offset=${offset}`
      );
      set({
        resources: [...get().resources, ...page.resources],
        resourcesHasMore: page.hasMore,
      });
    } catch {
      toast.error("Couldn't load more resources. Try again.");
    } finally {
      set({ resourcesLoadingMore: false });
    }
  },

  refreshStats: async () => {
    try {
      const { stats } = await api<{ stats: ResourceStats }>("/api/resources/stats");
      set({ stats });
    } catch {
      // Non-critical — dashboard counts just stay slightly stale until the next refresh.
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

  ensureStackResourcesLoaded: async (stackId) => {
    try {
      const { resources: stackResources } = await api<{ resources: Resource[] }>(`/api/stacks/${stackId}/resources`);
      const existingIds = new Set(get().resources.map((r) => r.id));
      const missing = stackResources.filter((r) => !existingIds.has(r.id));
      if (missing.length > 0) set({ resources: [...get().resources, ...missing] });
    } catch {
      // Non-critical — Stack Detail just falls back to whatever's already
      // loaded (correct for any account under the resources page size).
    }
  },

  ensureResourceLoaded: async (id) => {
    if (get().resources.some((r) => r.id === id)) return true;
    try {
      const { resource } = await api<{ resource: Resource }>(`/api/resources/${id}`);
      // Another fetch (or the initial hydrate) may have completed first —
      // guard against double-adding it.
      if (!get().resources.some((r) => r.id === id)) {
        set({ resources: [...get().resources, resource] });
      }
      return true;
    } catch {
      return false;
    }
  },

  addResource: async (input, opts) => {
    const { resource, duplicate } = await api<{ resource: Resource; duplicate: boolean }>("/api/resources", {
      method: "POST",
      body: JSON.stringify({ ...input, force: opts?.force }),
    });
    if (!duplicate) {
      set({ resources: [resource, ...get().resources] });
      if (input.tagNames?.length) void get().refreshTags();
      void get().refreshStats();
    }
    return { resource, duplicate };
  },

  updateResource: (id, patch) => {
    const prev = get().resources;
    const prevLinkChecks = get().linkChecks;
    const normalizedUrl = patch.url !== undefined ? normalizeUrl(patch.url) : undefined;
    set({
      resources: prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...patch,
              ...(normalizedUrl ? { url: normalizedUrl, domain: getDomain(normalizedUrl) } : {}),
              updatedAt: new Date().toISOString(),
            }
          : r
      ),
      // A changed URL invalidates any stored link-health result for it —
      // the server clears the row too; drop it locally so the UI doesn't
      // keep showing a status that referred to the old address.
      ...(patch.url !== undefined
        ? { linkChecks: Object.fromEntries(Object.entries(get().linkChecks).filter(([rid]) => rid !== id)) }
        : {}),
    });

    api<{ resource: Resource }>(`/api/resources/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then(() => {
        if (patch.tagNames?.length) void get().refreshTags();
        // Only these two fields change what the dashboard's stat counts
        // report (total/favorites exclude archived resources; archiving
        // also moves a resource out of the "added recently" count) —
        // skip the extra round trip for every other kind of edit.
        if (patch.isFavorite !== undefined || patch.isArchived !== undefined) void get().refreshStats();
      })
      .catch((e) => {
        set({ resources: prev, linkChecks: prevLinkChecks });
        toast.error(e instanceof Error ? e.message : "Couldn't save your changes. Try again.");
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
    set({
      resources: [],
      stacks: [],
      tags: [],
      categories: [],
      stats: { total: 0, favorites: 0, addedRecently: 0 },
      resourcesHasMore: false,
    });
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

  bulkAddToStack: async (resourceIds, stackId) => {
    const prev = get().resources;
    set({
      resources: prev.map((r) =>
        resourceIds.includes(r.id) && !r.stackIds.includes(stackId) ? { ...r, stackIds: [...r.stackIds, stackId] } : r
      ),
    });
    try {
      const { added } = await api<{ added: number }>("/api/resources/bulk-stack", {
        method: "POST",
        body: JSON.stringify({ resourceIds, stackId }),
      });
      return added;
    } catch (e) {
      set({ resources: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't add those resources to the stack. Try again.");
      throw e;
    }
  },

  bulkAddTags: async (resourceIds, tagNames) => {
    const prev = get().resources;
    try {
      const { count } = await api<{ count: number }>("/api/resources/bulk-tag", {
        method: "POST",
        body: JSON.stringify({ resourceIds, tagNames }),
      });
      void get().refreshTags();
      // Optimistic tag-id merge isn't safe pre-request (new tags may not
      // have ids yet) — just refetch the affected resources' real state
      // via a full hydrate-free approach: re-pull each from the server.
      // Cheap enough (bulk operations are a rare, deliberate action, not a
      // hot path) and guarantees correctness over guessing new tag ids.
      await Promise.all(
        resourceIds.map(async (id) => {
          try {
            const { resource } = await api<{ resource: Resource }>(`/api/resources/${id}`);
            set({ resources: get().resources.map((r) => (r.id === id ? resource : r)) });
          } catch {
            // Non-critical — this one card just won't show its new tags until the next full reload.
          }
        })
      );
      return count;
    } catch (e) {
      set({ resources: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't add those tags. Try again.");
      throw e;
    }
  },

  bulkArchiveResources: async (resourceIds, archived) => {
    const prev = get().resources;
    set({
      resources: prev.map((r) => (resourceIds.includes(r.id) ? { ...r, isArchived: archived } : r)),
    });
    try {
      const { count } = await api<{ count: number }>("/api/resources/bulk-archive", {
        method: "POST",
        body: JSON.stringify({ resourceIds, archived }),
      });
      void get().refreshStats();
      return count;
    } catch (e) {
      set({ resources: prev });
      toast.error(e instanceof Error ? e.message : "Couldn't update those resources. Try again.");
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

  refreshLinkChecks: async () => {
    try {
      const { linkChecks } = await api<{ linkChecks: Record<string, LinkHealth> }>("/api/library/link-checks");
      set({ linkChecks });
    } catch {
      // Non-critical — the next full hydrate will pick these up.
    }
  },

  checkResourceLink: async (id) => {
    const { linkHealth } = await api<{ linkHealth: LinkHealth }>(`/api/resources/${id}/check-link`, { method: "POST" });
    set({ linkChecks: { ...get().linkChecks, [id]: linkHealth } });
    // A link that flipped healthy<->broken clears any dismissed review
    // flag server-side — reflect that locally too, no extra round trip.
    set({
      resources: get().resources.map((r) => (r.id === id ? { ...r, needsReviewDismissed: false } : r)),
    });
    return linkHealth;
  },

  recheckLibrary: async (resourceIds) => {
    const { checked } = await api<{ checked: number; results: Record<string, string> }>("/api/library/recheck", {
      method: "POST",
      body: JSON.stringify({ resourceIds }),
    });
    await get().refreshLinkChecks();
    return { checked };
  },

  mergeResources: async (keeperId, loserId) => {
    const { resource } = await api<{ resource: Resource }>("/api/library/merge", {
      method: "POST",
      body: JSON.stringify({ keeperId, loserId }),
    });
    set({
      resources: get().resources.filter((r) => r.id !== loserId).map((r) => (r.id === keeperId ? resource : r)),
    });
    void get().refreshTags();
    void get().refreshStats();
    return resource;
  },

  dismissNeedsReview: (id) => {
    get().updateResource(id, { needsReviewDismissed: true });
  },
}));
