import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource } from "@/lib/types";
import { needsReview as isNeedsReview } from "@/lib/utils";
import { findPossibleDuplicates } from "@/lib/duplicates";
import { listResources, getResource, deleteResource } from "./resources";
import { listLinkChecks } from "./link-check";
import { ensureTags } from "./tags";

type Client = SupabaseClient<Database>;

export interface LibraryHealthSummary {
  totalResources: number;
  duplicateGroups: number;
  linkIssues: number;
  needsReview: number;
  missingMetadata: number;
}

export async function getLibraryHealth(client: Client, userId: string): Promise<LibraryHealthSummary> {
  const [resources, linkChecks] = await Promise.all([
    listResources(client, userId),
    listLinkChecks(client, userId),
  ]);
  const active = resources.filter((r) => !r.isArchived);

  const duplicateGroups = findPossibleDuplicates(
    active.map((r) => ({ id: r.id, title: r.title, domain: r.domain, createdAt: r.createdAt }))
  ).length;

  let linkIssues = 0;
  let needsReviewCount = 0;
  let missingMetadata = 0;
  for (const r of active) {
    const link = linkChecks.get(r.id);
    if (link && (link.status === "unavailable" || link.status === "blocked")) linkIssues++;
    if (isNeedsReview(r, link?.status)) needsReviewCount++;
    if (!r.description && r.useCases.length === 0 && r.tagIds.length === 0) missingMetadata++;
  }

  return {
    totalResources: active.length,
    duplicateGroups,
    linkIssues,
    needsReview: needsReviewCount,
    missingMetadata,
  };
}

export interface DuplicateGroupWithResources {
  ids: string[];
  confidence: number;
  resources: Resource[];
}

export async function getDuplicateGroups(client: Client, userId: string): Promise<DuplicateGroupWithResources[]> {
  const resources = await listResources(client, userId);
  const active = resources.filter((r) => !r.isArchived);
  const byId = new Map(active.map((r) => [r.id, r]));

  const groups = findPossibleDuplicates(
    active.map((r) => ({ id: r.id, title: r.title, domain: r.domain, createdAt: r.createdAt }))
  );

  return groups.map((g) => ({
    ...g,
    resources: g.ids.map((id) => byId.get(id)!).filter(Boolean),
  }));
}

/**
 * Merges `loserId` into `keeperId` per the phase's own merge rules —
 * union tags, prefer user-owned description/Useful For, keep favorite if
 * either was, never silently drop a note (concatenates both, clearly
 * separated, if both exist) — then deletes the loser. Both resources must
 * belong to the caller (RLS-enforced on every read/write here).
 */
export async function mergeResources(
  client: Client,
  userId: string,
  keeperId: string,
  loserId: string
): Promise<Resource> {
  if (keeperId === loserId) throw new Error("Can't merge a resource with itself.");
  const [keeper, loser] = await Promise.all([
    getResource(client, userId, keeperId),
    getResource(client, userId, loserId),
  ]);
  if (!keeper || !loser) throw new Error("Both resources must exist.");

  const dbPatch: Database["public"]["Tables"]["resources"]["Update"] = {};

  // Description: keeper's user-owned text always wins; otherwise take
  // whichever is non-empty (preferring the keeper), never inventing one.
  if (keeper.descriptionSource !== "user") {
    if (!keeper.description && loser.description) {
      dbPatch.description = loser.description;
      dbPatch.description_source = loser.descriptionSource ?? "system";
    } else if (loser.description.length > keeper.description.length && loser.descriptionSource === "user") {
      dbPatch.description = loser.description;
      dbPatch.description_source = "user";
    }
  }

  if (keeper.usefulForSource !== "user" && keeper.useCases.length === 0 && loser.useCases.length > 0) {
    dbPatch.use_cases = loser.useCases;
    dbPatch.useful_for_source = loser.usefulForSource ?? "system";
  }

  if (!keeper.categoryId && loser.categoryId) dbPatch.category_id = loser.categoryId;
  if (keeper.isFavorite || loser.isFavorite) dbPatch.is_favorite = true;

  // Notes: never silently discard either — concatenate if both exist and differ.
  if (loser.notes && loser.notes !== keeper.notes) {
    dbPatch.notes = keeper.notes ? `${keeper.notes}\n\n— From the merged duplicate —\n${loser.notes}` : loser.notes;
  }

  if (Object.keys(dbPatch).length > 0) {
    const { error } = await client.from("resources").update(dbPatch).eq("id", keeperId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  // Tags: union, deduped by the same normalization ensureTags already uses.
  const unionTagNames = Array.from(new Set([...keeper.tagIds, ...loser.tagIds]));
  if (unionTagNames.length > 0) {
    // tagIds are ids, not names — resolve to names via the tags table so
    // ensureTags can dedupe/normalize them the same way it always does.
    const { data: tagRows, error: tagErr } = await client
      .from("tags")
      .select("id, name")
      .eq("user_id", userId)
      .in("id", unionTagNames);
    if (tagErr) throw new Error(tagErr.message);
    const names = (tagRows ?? []).map((t) => t.name);
    const tagIds = await ensureTags(client, userId, names);
    await client.from("resource_tags").delete().eq("resource_id", keeperId);
    if (tagIds.length) {
      await client.from("resource_tags").insert(tagIds.map((tag_id) => ({ resource_id: keeperId, tag_id })));
    }
  }

  // Stacks: union.
  const unionStackIds = Array.from(new Set([...keeper.stackIds, ...loser.stackIds]));
  if (unionStackIds.length > 0) {
    await client.from("resource_stacks").delete().eq("resource_id", keeperId);
    await client
      .from("resource_stacks")
      .insert(unionStackIds.map((stack_id) => ({ resource_id: keeperId, stack_id })));
  }

  await deleteResource(client, userId, loserId);

  const merged = await getResource(client, userId, keeperId);
  if (!merged) throw new Error("Merge failed unexpectedly.");
  return merged;
}
