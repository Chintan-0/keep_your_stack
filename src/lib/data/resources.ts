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
  /** Only ever set by server-side seeding (demo data) — never accepted from a client request body. */
  isFavorite?: boolean;
  isArchived?: boolean;
  /** Set by the bookmark importer — e.g. "chrome-bookmarks" + "Bookmarks bar / Development". */
  importSource?: string | null;
  importFolder?: string | null;
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
 */
export async function createResource(
  client: Client,
  userId: string,
  input: ResourceInput,
  opts: { force?: boolean } = {}
): Promise<{ resource: Resource; duplicate: boolean }> {
  const normalized = normalizeUrl(input.url);
  if (!normalized) throw new Error("Invalid URL");

  if (!opts.force) {
    const existing = await findResourceByUrl(client, userId, input.url);
    if (existing) return { resource: existing, duplicate: true };
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
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.useCases !== undefined) dbPatch.use_cases = patch.useCases;
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.isFavorite !== undefined) dbPatch.is_favorite = patch.isFavorite;
  if (patch.isArchived !== undefined) dbPatch.is_archived = patch.isArchived;
  if (patch.pricing !== undefined) dbPatch.pricing = patch.pricing;
  if (patch.platform !== undefined) dbPatch.platform = patch.platform ?? [];

  if (Object.keys(dbPatch).length > 0) {
    const { error } = await client.from("resources").update(dbPatch).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
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
