import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource } from "@/lib/types";
import { mapResourceRow, RESOURCE_SELECT } from "./mappers";
import { ensureTags } from "./tags";
import { normalizeUrl, getDomain } from "@/lib/utils";

type Client = SupabaseClient<Database>;

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

// Returns both active and archived resources — the UI keeps them in one
// array and filters client-side (same shape as the local-only build), so
// there's exactly one place ("is this archived?") that decides visibility.
// A single indexed query is plenty at personal-toolbox scale; add a
// server-side archived filter or pagination here first if that changes.
export async function listResources(client: Client, userId: string): Promise<Resource[]> {
  const { data, error } = await client
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapResourceRow);
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
    const tagIds = await ensureTags(client, userId, tagNames);
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
      title: input.title?.trim() || domain,
      url: normalized,
      normalized_url: normalized,
      domain,
      description: input.description?.trim() || "",
      favicon_url: input.faviconUrl ?? null,
      image_url: input.imageUrl ?? null,
      category_id: input.categoryId ?? null,
      use_cases: input.useCases?.filter(Boolean) ?? [],
      notes: input.notes?.trim() || "",
      pricing: input.pricing ?? null,
      platform: input.platform ?? [],
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
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.description !== undefined) {
    dbPatch.description = patch.description;
    // Any caller other than enrichResource() editing this is a human —
    // default to "user" unless the caller (enrichResource) says otherwise.
    dbPatch.description_source = patch.descriptionSource ?? "user";
  }
  if (patch.useCases !== undefined) {
    dbPatch.use_cases = patch.useCases;
    dbPatch.useful_for_source = patch.usefulForSource ?? "user";
  }
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.isFavorite !== undefined) dbPatch.is_favorite = patch.isFavorite;
  if (patch.isArchived !== undefined) dbPatch.is_archived = patch.isArchived;
  if (patch.pricing !== undefined) dbPatch.pricing = patch.pricing;
  if (patch.platform !== undefined) dbPatch.platform = patch.platform ?? [];
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
    const tagIds = await ensureTags(client, userId, patch.tagNames);
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
  if (!full) throw new Error("Resource not found after update");
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

export async function deleteResource(client: Client, userId: string, id: string): Promise<void> {
  const { error } = await client.from("resources").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
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
