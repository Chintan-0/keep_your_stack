import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource } from "@/lib/types";
import { fetchMetadata } from "./metadata";
import { getResource, updateResource } from "./resources";
import { listCategories } from "./categories";
import { listTags } from "./tags";
import {
  cleanDescription,
  suggestUsefulFor,
  suggestTags,
  suggestCategoryForResource,
  normalizeTagName,
  canOverwriteDescription,
  canOverwriteUsefulFor,
} from "@/lib/enrichment";

type Client = SupabaseClient<Database>;

export interface EnrichmentResult {
  resource: Resource;
  status: Resource["enrichmentStatus"];
}

/**
 * Runs one resource through the enrichment pipeline: fetch page metadata
 * (SSRF-guarded, see fetchMetadata), then deterministically derive
 * description/Useful-For/tags/category from real evidence only.
 *
 * User-authored fields are never touched: description/useCases are only
 * written when they're currently empty or were themselves system-authored
 * (descriptionSource/usefulForSource !== "user") — so a manual edit always
 * wins, even on a later retry. Tags are pure set-union (add-only), so a
 * user-created tag can never be removed by this. Category is only filled
 * when it's currently unset AND the match is high-confidence (folder or an
 * exact existing-category-name mention) — never overwritten, never
 * invented.
 */
export async function enrichResource(client: Client, userId: string, resourceId: string): Promise<EnrichmentResult> {
  const resource = await getResource(client, userId, resourceId);
  if (!resource) throw new Error("Resource not found");

  const attemptedAt = new Date().toISOString();
  const result = await fetchMetadata(resource.url);

  if (!result.ok) {
    const updated = await updateResource(client, userId, resourceId, {
      enrichmentStatus: "failed",
      enrichmentAttempts: resource.enrichmentAttempts + 1,
      enrichmentAttemptedAt: attemptedAt,
    });
    return { resource: updated, status: "failed" };
  }

  const { data } = result;
  const cleanedDescription = cleanDescription(data.description);
  const effectiveTitle = data.title || resource.title;

  const patch: Parameters<typeof updateResource>[3] = {
    enrichmentAttempts: resource.enrichmentAttempts + 1,
    enrichmentAttemptedAt: attemptedAt,
  };

  if (canOverwriteDescription(resource) && cleanedDescription) {
    patch.description = cleanedDescription;
    patch.descriptionSource = "system";
  }
  const finalDescription = patch.description ?? resource.description;

  if (canOverwriteUsefulFor(resource)) {
    const suggestion = suggestUsefulFor({ title: effectiveTitle, description: finalDescription });
    if (suggestion && suggestion.confidence !== "low") {
      patch.useCases = [suggestion.value];
      patch.usefulForSource = "system";
    }
  }
  const finalUsefulForCount = patch.useCases?.length ?? resource.useCases.length;

  const suggested = suggestTags({ title: effectiveTitle, description: finalDescription, domain: resource.domain });
  let finalTagCount = resource.tagIds.length;
  if (suggested.length > 0) {
    const existingTags = await listTags(client, userId);
    const existingNames = resource.tagIds
      .map((id) => existingTags.find((t) => t.id === id)?.name)
      .filter(Boolean) as string[];
    // Union, not replace — updateResource's tagNames patch replaces the
    // whole set, so the existing names have to be included explicitly for
    // this to be additive rather than destructive.
    const union = Array.from(new Set([...existingNames, ...suggested.map(normalizeTagName)]));
    if (union.length !== existingNames.length) {
      patch.tagNames = union;
      finalTagCount = union.length;
    }
  }

  if (!resource.categoryId) {
    const categories = await listCategories(client, userId);
    const categorySuggestion = suggestCategoryForResource(
      { title: effectiveTitle, description: finalDescription, domain: resource.domain, folder: resource.importFolder },
      categories
    );
    if (categorySuggestion && categorySuggestion.confidence === "high") {
      patch.categoryId = categorySuggestion.categoryId;
    }
  }

  const gotDescription = !!finalDescription;
  const gotContext = finalUsefulForCount > 0 || finalTagCount > 0;
  patch.enrichmentStatus = gotDescription && gotContext ? "enriched" : "partial";

  const updated = await updateResource(client, userId, resourceId, patch);
  return { resource: updated, status: patch.enrichmentStatus as Resource["enrichmentStatus"] };
}
