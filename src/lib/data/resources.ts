import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource } from "@/lib/types";
import { mapResourceRow, RESOURCE_SELECT } from "./mappers";
import { ensureTags } from "./tags";
import { normalizeUrl, getDomain } from "@/lib/utils";
import { clampTitle, clampDescription, clampNotes, clampUseCases, clampTagNames, sanitizePricing, sanitizePlatform } from "@/lib/resource-validation";
import { NotFoundError } from "./errors";

type Client = SupabaseClient<Database>;

export { NotFoundError };

export interface ResourceInput {
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
  /** Only ever set by server-side seeding (demo data) or a JSON backup restore — never accepted from the general Add Resource/extension request body. */
  isFavorite?: boolean;
  isArchived?: boolean;
  /** Set by the bookmark importer — e.g. "chrome-bookmarks" + "Bookmarks bar / Development". */
  importSource?: string | null;
  importFolder?: string | null;
  /** The source's own ID for this item, when one exists (e.g. a KeepYourStack backup's resource id) — provenance only. */
  importSourceId?: string | null;
  /**
   * Only ever set by the JSON backup importer, restoring a user's own
   * previously-exported timestamps — never accepted from the general
   * create-resource request body (which always uses "now", correctly,
   * for an actually-new save). Must be a value the resource's own prior
   * export produced, not an arbitrary client-supplied date.
   */
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Whoever supplies a non-empty description/useCases through the normal
 * create/edit path had the chance to review or type it themselves, so it
 * defaults to "user" — authoritative, never overwritten by later
 * enrichment. Only src/lib/data/enrichment.ts explicitly marks a value as
 * "system" (still overwritable next time, until the user touches it).
 */
function defaultSource(hasValue: boolean): "user" | null {
  return hasValue ? "user" : null;
}

// Returns both active and archived resources in one shot, uncapped by
// pagination — intentionally, this is the "I need genuinely everything"
// helper. As of Phase 16 the main list screens (All Resources, Favorites,
// Archive) no longer call this — they use listResourcesPage below. What
// still does: export, Library Health, duplicate detection, and the
// recheck-all-links job, each of which would silently produce wrong
// answers (missing resources in an export, undercounted duplicates) if it
// only saw part of the library. So this stays a single indexed query
// bounded by MAX_RESOURCES_PER_LIST rather than paginated.
//
// Phase 12 load testing (§5/§39) found this `.limit()` was silently
// overridden by PostgREST's own lower `max_rows` (supabase/config.toml
// defaulted to 1000 — measured live: a 10,000-resource account got back
// exactly 1000 rows here, no error, nothing indicating 9,000 resources
// were missing). Both must always be kept aligned — see
// supabase/config.toml's own comment on max_rows. Phase 16 raised both to
// 20,000 to match Phase 11's own documented import ceiling. A real hosted
// Supabase project's equivalent setting (Project Settings → API → Max
// Rows) must also be raised to 20,000 before launch — this file only
// controls local dev.
const MAX_RESOURCES_PER_LIST = 20000;

export async function listResources(client: Client, userId: string): Promise<Resource[]> {
  const { data, error } = await client
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_RESOURCES_PER_LIST);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapResourceRow);
}

export const DEFAULT_RESOURCES_PAGE_SIZE = 300;
export const MAX_RESOURCES_PAGE_SIZE = 1000;

export interface ResourcesPage {
  resources: Resource[];
  total: number;
  hasMore: boolean;
}

/**
 * Paginated counterpart to listResources — same shape/ordering (newest
 * first, active + archived together, filtered client-side same as
 * always), just bounded to one page. `total` comes from the same
 * round trip (`count: "exact"` alongside the row fetch, not a second
 * query) so the client can show "showing X of Y" / know whether more
 * exists without a separate request. Added for the client's initial
 * load and "load more" — listResources itself is untouched and still
 * used wherever the full set is genuinely needed server-side (export,
 * library health, duplicate detection, search vocabulary).
 */
export async function listResourcesPage(
  client: Client,
  userId: string,
  { limit = DEFAULT_RESOURCES_PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number }
): Promise<ResourcesPage> {
  const pageSize = Math.min(Math.max(1, limit), MAX_RESOURCES_PAGE_SIZE);
  const safeOffset = Math.max(0, offset);
  const { data, error, count } = await client
    .from("resources")
    .select(RESOURCE_SELECT, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + pageSize - 1);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    resources: (data ?? []).map(mapResourceRow),
    total,
    hasMore: safeOffset + pageSize < total,
  };
}

/**
 * Every resource belonging to a given stack, regardless of pagination —
 * a stack is a curated subset (not expected to rival the whole library in
 * size), so unlike listResourcesPage this just returns the lot. Used so
 * Stack Detail shows every member even ones older than whatever page the
 * client's already loaded into its general resource cache.
 */
export async function listResourcesForStack(client: Client, userId: string, stackId: string): Promise<Resource[]> {
  const { data: links, error: linksError } = await client
    .from("resource_stacks")
    .select("resource_id")
    .eq("stack_id", stackId);
  if (linksError) throw new Error(linksError.message);
  const ids = (links ?? []).map((l) => l.resource_id);
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("user_id", userId)
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapResourceRow);
}

export interface ResourceStats {
  total: number;
  favorites: number;
  /** Active (non-archived) resources created in the last 14 days — matches the dashboard's "Added recently" stat. */
  addedRecently: number;
}

/**
 * Three cheap indexed counts instead of downloading every resource just to
 * show three numbers on the dashboard — the exact fix for the "dashboard
 * shouldn't fetch the whole library" performance finding.
 */
export async function getResourceStats(client: Client, userId: string): Promise<ResourceStats> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [totalRes, favRes, recentRes] = await Promise.all([
    client.from("resources").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_archived", false),
    client
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_archived", false)
      .eq("is_favorite", true),
    client
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_archived", false)
      .gte("created_at", fourteenDaysAgo),
  ]);
  if (totalRes.error) throw new Error(totalRes.error.message);
  if (favRes.error) throw new Error(favRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);
  return {
    total: totalRes.count ?? 0,
    favorites: favRes.count ?? 0,
    addedRecently: recentRes.count ?? 0,
  };
}

export async function getResource(client: Client, userId: string, id: string): Promise<Resource | null> {
  const { data, error } = await client
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapResourceRow(data) : null;
}

export async function findResourceByUrl(client: Client, userId: string, url: string): Promise<Resource | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const { data, error } = await client
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("user_id", userId)
    .eq("normalized_url", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapResourceRow(data) : null;
}

/**
 * The additive half of `force` — see createResource's own doc comment.
 * Deliberately mirrors library-health.ts's mergeResources() rules (fill
 * gaps, union tags/stacks, append rather than replace notes) since it's
 * the same underlying question: "I have new information about a resource
 * I already saved — combine it in without losing what's already there."
 */
async function mergeInputIntoExisting(
  client: Client,
  userId: string,
  existing: Resource,
  input: ResourceInput
): Promise<Resource> {
  const patch: ResourcePatch = {};

  if (!existing.description && input.description?.trim()) {
    patch.description = input.description.trim();
  }
  const newUseCases = input.useCases?.filter(Boolean) ?? [];
  if (existing.useCases.length === 0 && newUseCases.length > 0) {
    patch.useCases = newUseCases;
  }
  if (!existing.categoryId && input.categoryId) {
    patch.categoryId = input.categoryId;
  }
  const trimmedNotes = input.notes?.trim();
  if (trimmedNotes && trimmedNotes !== existing.notes) {
    patch.notes = existing.notes ? `${existing.notes}\n\n${trimmedNotes}` : trimmedNotes;
  }

  const newTagNames = input.tagNames?.filter(Boolean) ?? [];
  if (newTagNames.length > 0) {
    let existingNames: string[] = [];
    if (existing.tagIds.length > 0) {
      const { data: tagRows, error: tagErr } = await client
        .from("tags")
        .select("name")
        .eq("user_id", userId)
        .in("id", existing.tagIds);
      if (tagErr) throw new Error(tagErr.message);
      existingNames = (tagRows ?? []).map((t) => t.name);
    }
    patch.tagNames = Array.from(new Set([...existingNames, ...newTagNames]));
  }

  if (input.stackIds?.length) {
    patch.stackIds = Array.from(new Set([...existing.stackIds, ...input.stackIds]));
  }

  if (Object.keys(patch).length === 0) return existing;
  return updateResource(client, userId, existing.id, patch);
}

async function linkTagsAndStacks(
  client: Client,
  userId: string,
  resourceId: string,
  tagNames: string[] | undefined,
  stackIds: string[] | undefined
) {
  if (tagNames && tagNames.length) {
    const tagIds = await ensureTags(client, userId, clampTagNames(tagNames));
    if (tagIds.length) {
      const rows = tagIds.map((tag_id) => ({ resource_id: resourceId, tag_id }));
      const { error } = await client.from("resource_tags").upsert(rows, { onConflict: "resource_id,tag_id" });
      if (error) throw new Error(error.message);
    }
  }
  if (stackIds && stackIds.length) {
    const rows = stackIds.map((stack_id) => ({ resource_id: resourceId, stack_id }));
    const { error } = await client.from("resource_stacks").upsert(rows, { onConflict: "resource_id,stack_id" });
    if (error) throw new Error(error.message);
  }
}

/**
 * Creates a resource, or returns the existing one if this user already
 * saved the same normalized URL — this is the server-side half of
 * duplicate detection; a client can't bypass it by skipping a check.
 *
 * `force` does NOT create a second row for the same URL — the
 * (user_id, normalized_url) unique index makes that structurally
 * impossible by design (see Phase 9: exact duplicates can't exist for one
 * user). What it means instead is "apply whatever I just entered onto the
 * resource I already have" — additively (fills in what's missing, unions
 * tags/stacks, appends a differing note), never overwriting or discarding
 * existing data. `duplicate` is still true either way; the caller decides
 * what to tell the user.
 */
export async function createResource(
  client: Client,
  userId: string,
  input: ResourceInput,
  opts: { force?: boolean } = {}
): Promise<{ resource: Resource; duplicate: boolean }> {
  const normalized = normalizeUrl(input.url);
  if (!normalized) throw new Error("Invalid URL");

  const existing = await findResourceByUrl(client, userId, input.url);
  if (existing) {
    if (!opts.force) return { resource: existing, duplicate: true };
    const merged = await mergeInputIntoExisting(client, userId, existing, input);
    return { resource: merged, duplicate: true };
  }

  if (input.categoryId) {
    const { data: owned, error: ownedError } = await client
      .from("categories")
      .select("id")
      .eq("id", input.categoryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownedError) throw new Error(ownedError.message);
    if (!owned) throw new Error("That category doesn't exist.");
  }

  const domain = getDomain(normalized);
  const { data, error } = await client
    .from("resources")
    .insert({
      user_id: userId,
      title: clampTitle(input.title?.trim() || domain),
      url: normalized,
      normalized_url: normalized,
      domain,
      description: clampDescription(input.description?.trim() || ""),
      favicon_url: input.faviconUrl ?? null,
      image_url: input.imageUrl ?? null,
      category_id: input.categoryId ?? null,
      use_cases: clampUseCases(input.useCases?.filter(Boolean) ?? []),
      notes: clampNotes(input.notes?.trim() || ""),
      pricing: sanitizePricing(input.pricing),
      platform: sanitizePlatform(input.platform),
      is_favorite: input.isFavorite ?? false,
      is_archived: input.isArchived ?? false,
      import_source: input.importSource ?? null,
      import_folder: input.importFolder ?? null,
      import_source_id: input.importSourceId ?? null,
      description_source: defaultSource(!!input.description?.trim()),
      useful_for_source: defaultSource(!!input.useCases?.filter(Boolean).length),
      // Nothing to enrich yet if it was already saved with a real
      // description/useful-for (e.g. the web Add Resource flow, which
      // fetches metadata before the user ever hits Save) — otherwise it's
      // a fast title+URL save (import, or the extension) waiting on the
      // Phase B enrichment pass.
      enrichment_status: input.description?.trim() || input.useCases?.filter(Boolean).length ? "enriched" : "pending",
      // Only a JSON backup restore ever supplies these — it's the user's
      // own real prior history, not an arbitrary claim. Left unset (falls
      // back to the column's own now() default) for every other caller.
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
      ...(input.updatedAt ? { updated_at: input.updatedAt } : {}),
    })
    .select(RESOURCE_SELECT)
    .single();

  if (error) {
    // 23505 = unique_violation on (user_id, normalized_url): a race with
    // another request beat us to it. Treat it the same as a normal dup.
    if (error.code === "23505") {
      const existing = await findResourceByUrl(client, userId, input.url);
      if (existing) return { resource: existing, duplicate: true };
    }
    throw new Error(error.message);
  }

  await linkTagsAndStacks(client, userId, data.id, input.tagNames, input.stackIds);
  const full = await getResource(client, userId, data.id);
  return { resource: full!, duplicate: false };
}

export interface ResourcePatch {
  /** Manual URL correction — e.g. accepting a detected redirect's destination. Never applied automatically. */
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
  /** Internal — set explicitly only by src/lib/data/enrichment.ts. Any other caller (the UI) editing description/useCases is always "user". */
  descriptionSource?: "system" | "user";
  usefulForSource?: "system" | "user";
  enrichmentStatus?: Resource["enrichmentStatus"];
  enrichmentAttempts?: number;
  enrichmentAttemptedAt?: string;
  /** Explicit "dismiss from Needs Review" / "un-dismiss" — any OTHER edit already clears a dismissal automatically (see below). */
  needsReviewDismissed?: boolean;
}

export async function updateResource(
  client: Client,
  userId: string,
  id: string,
  patch: ResourcePatch
): Promise<Resource> {
  // Fail fast and honestly on a nonexistent/foreign id, before doing any
  // writes — without this, an update for someone else's (or a typo'd) id
  // would silently affect zero rows and only surface as a confusing
  // "not found after update" once every field/tag/stack write had already
  // been attempted.
  const current = await getResource(client, userId, id);
  if (!current) throw new NotFoundError("Resource not found.");

  // A foreign key alone doesn't enforce ownership (FK validation isn't
  // RLS-scoped) — confirm a non-null category id is really this user's own
  // before letting a resource point at it.
  if (patch.categoryId) {
    const { data: owned, error: ownedError } = await client
      .from("categories")
      .select("id")
      .eq("id", patch.categoryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownedError) throw new Error(ownedError.message);
    if (!owned) throw new Error("That category doesn't exist.");
  }

  const dbPatch: Database["public"]["Tables"]["resources"]["Update"] = {};
  if (patch.url !== undefined) {
    const normalized = normalizeUrl(patch.url);
    if (!normalized) throw new Error("Invalid URL");
    // Same uniqueness rule as creating a resource — never silently merge
    // into an existing one; the user can use Merge in the Duplicate Center
    // for that instead.
    const existing = await findResourceByUrl(client, userId, normalized);
    if (existing && existing.id !== id) {
      throw new Error("You already have a resource saved at that URL.");
    }
    dbPatch.url = normalized;
    dbPatch.normalized_url = normalized;
    dbPatch.domain = getDomain(normalized);
  }
  if (patch.title !== undefined) dbPatch.title = clampTitle(patch.title);
  if (patch.description !== undefined) {
    dbPatch.description = clampDescription(patch.description);
    // Any caller other than enrichResource() editing this is a human —
    // default to "user" unless the caller (enrichResource) says otherwise.
    dbPatch.description_source = patch.descriptionSource ?? "user";
  }
  if (patch.useCases !== undefined) {
    dbPatch.use_cases = clampUseCases(patch.useCases);
    dbPatch.useful_for_source = patch.usefulForSource ?? "user";
  }
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  if (patch.notes !== undefined) dbPatch.notes = clampNotes(patch.notes);
  if (patch.isFavorite !== undefined) dbPatch.is_favorite = patch.isFavorite;
  if (patch.isArchived !== undefined) dbPatch.is_archived = patch.isArchived;
  if (patch.pricing !== undefined) dbPatch.pricing = sanitizePricing(patch.pricing);
  if (patch.platform !== undefined) dbPatch.platform = sanitizePlatform(patch.platform);
  if (patch.enrichmentStatus !== undefined) dbPatch.enrichment_status = patch.enrichmentStatus;
  if (patch.enrichmentAttempts !== undefined) dbPatch.enrichment_attempts = patch.enrichmentAttempts;
  if (patch.enrichmentAttemptedAt !== undefined) dbPatch.enrichment_attempted_at = patch.enrichmentAttemptedAt;

  if (patch.needsReviewDismissed !== undefined) {
    dbPatch.needs_review_dismissed = patch.needsReviewDismissed;
  } else if (
    // Any other real edit is a natural point to re-surface a previously
    // dismissed review item — the thing the user dismissed may no longer
    // even be true. Bookkeeping-only patches (enrichment status/attempts)
    // don't count as "the user did something", so they're excluded.
    patch.url !== undefined ||
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.useCases !== undefined ||
    patch.categoryId !== undefined ||
    patch.notes !== undefined ||
    patch.tagNames !== undefined ||
    patch.stackIds !== undefined
  ) {
    dbPatch.needs_review_dismissed = false;
  }

  if (Object.keys(dbPatch).length > 0) {
    const { error } = await client.from("resources").update(dbPatch).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  if (patch.url !== undefined) {
    // The URL changed, so any stored link-health result now refers to a
    // stale address — clear it rather than keep showing (say) "healthy"
    // for a URL that was never actually checked.
    await client.from("resource_link_checks").delete().eq("resource_id", id).eq("user_id", userId);
  }

  if (patch.tagNames !== undefined) {
    const tagIds = await ensureTags(client, userId, clampTagNames(patch.tagNames));
    await client.from("resource_tags").delete().eq("resource_id", id);
    if (tagIds.length) {
      await client
        .from("resource_tags")
        .insert(tagIds.map((tag_id) => ({ resource_id: id, tag_id })));
    }
  }

  if (patch.stackIds !== undefined) {
    await client.from("resource_stacks").delete().eq("resource_id", id);
    if (patch.stackIds.length) {
      await client
        .from("resource_stacks")
        .insert(patch.stackIds.map((stack_id) => ({ resource_id: id, stack_id })));
    }
  }

  const full = await getResource(client, userId, id);
  if (!full) throw new NotFoundError("Resource not found.");
  return full;
}

/** Moves many resources to one category (or "No category") in a single statement. */
export async function bulkMoveResources(
  client: Client,
  userId: string,
  resourceIds: string[],
  categoryId: string | null
): Promise<number> {
  if (resourceIds.length === 0) return 0;

  // A foreign key check alone doesn't enforce ownership (FK validation
  // isn't RLS-scoped), so without this a client could point resources at
  // a category id that isn't theirs — never leaks that category's data,
  // but leaves a dangling reference. Confirm it's really this user's own.
  if (categoryId) {
    const { data: owned, error: ownedError } = await client
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownedError) throw new Error(ownedError.message);
    if (!owned) throw new Error("That category doesn't exist.");
  }

  const { data, error } = await client
    .from("resources")
    .update({ category_id: categoryId })
    .eq("user_id", userId)
    .in("id", resourceIds)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Adds `stackId` to every resource in `resourceIds` in one batch insert
 * instead of one request per resource (Stack Studio's bulk "Add to
 * stack" — Part J's explicit "do not fire hundreds of individual API
 * requests"). Ownership of both the stack and every resource is enforced
 * by RLS on the insert itself (resource_stacks' own "insert via owned
 * resource and stack" policy — see supabase/migrations/
 * 20260101000002_rls_policies.sql), not re-checked here; a resource id
 * that isn't the caller's own simply doesn't get a row inserted for it,
 * same fail-safe behavior addResourceToStack already relies on.
 */
export async function bulkAddToStack(client: Client, userId: string, resourceIds: string[], stackId: string): Promise<number> {
  if (resourceIds.length === 0) return 0;
  const { data, error } = await client
    .from("resource_stacks")
    .upsert(
      resourceIds.map((resource_id) => ({ resource_id, stack_id: stackId })),
      { onConflict: "resource_id,stack_id", ignoreDuplicates: true }
    )
    .select("resource_id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Same batching rationale as bulkAddToStack — one insert for every (resource, tag) pair rather than N requests. Reuses ensureTags so tag creation/normalization/dedup stays the single existing implementation. */
export async function bulkAddTags(
  client: Client,
  userId: string,
  resourceIds: string[],
  tagNames: string[]
): Promise<{ count: number; tagIds: string[] }> {
  if (resourceIds.length === 0 || tagNames.length === 0) return { count: 0, tagIds: [] };
  const tagIds = await ensureTags(client, userId, clampTagNames(tagNames));
  if (tagIds.length === 0) return { count: 0, tagIds: [] };

  const rows = resourceIds.flatMap((resource_id) => tagIds.map((tag_id) => ({ resource_id, tag_id })));
  const { error } = await client.from("resource_tags").upsert(rows, { onConflict: "resource_id,tag_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  // Returning the resolved tag ids lets callers patch their own cached
  // resource state directly instead of re-fetching every affected
  // resource one-by-one (a real problem at Stack Studio's import scale —
  // see src/lib/store.ts's bulkAddTags).
  return { count: resourceIds.length, tagIds };
}

/** Bulk archive/restore — a single UPDATE ... WHERE id IN (...), same shape as bulkMoveResources. */
export async function bulkSetArchived(client: Client, userId: string, resourceIds: string[], archived: boolean): Promise<number> {
  if (resourceIds.length === 0) return 0;
  const { data, error } = await client
    .from("resources")
    .update({ is_archived: archived })
    .eq("user_id", userId)
    .in("id", resourceIds)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Throws (rather than silently no-op-succeeding) when `id` doesn't exist
 * or isn't the caller's own — otherwise a delete request for someone
 * else's id (or a typo'd id) would report success despite affecting zero
 * rows, since `.eq("user_id", userId)` alone makes that outcome
 * indistinguishable from "deleted" without checking what was returned.
 */
export async function deleteResource(client: Client, userId: string, id: string): Promise<void> {
  const { data, error } = await client.from("resources").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new NotFoundError("Resource not found.");
}

export async function addResourceToStack(client: Client, _userId: string, resourceId: string, stackId: string) {
  // RLS's insert policy on resource_stacks already checks both the
  // resource and the stack belong to auth.uid(); this call fails safely
  // (permission denied) if either doesn't, without needing an extra
  // ownership query here.
  const { error } = await client
    .from("resource_stacks")
    .upsert({ resource_id: resourceId, stack_id: stackId }, { onConflict: "resource_id,stack_id" });
  if (error) throw new Error(error.message);
}

export async function removeResourceFromStack(client: Client, _userId: string, resourceId: string, stackId: string) {
  const { error } = await client
    .from("resource_stacks")
    .delete()
    .eq("resource_id", resourceId)
    .eq("stack_id", stackId);
  if (error) throw new Error(error.message);
}
