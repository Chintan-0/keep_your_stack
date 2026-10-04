import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource } from "@/lib/types";
import { fetchMetadata } from "./metadata";
import { getResource, updateResource } from "./resources";
import { listCategories } from "./categories";
import { listTags } from "./tags";
import { trainClassifier, predictCategory, shouldApplyPrediction, type ClassifierPrediction } from "@/lib/ai-classifier";

async function isAiCategorizationEnabled(client: Client, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("ai_categorization_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  return data?.ai_categorization_enabled === true;
}

/** Trains on the user's own categorized resources (their titles, domains, and descriptions) and predicts a category for this one. Nothing leaves the server. */
async function predictCategoryFromLibrary(
  client: Client,
  userId: string,
  input: { title: string; domain: string; description: string }
): Promise<ClassifierPrediction | null> {
  const { data, error } = await client
    .from("resources")
    .select("title, domain, description, category_id")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .not("category_id", "is", null)
    .limit(5000);
  if (error || !data) return null;
  const model = trainClassifier(
    data.map((r) => ({
      text: `${r.title} ${r.domain} ${r.description}`,
      label: r.category_id as string,
    }))
  );
  if (!model) return null;
  return predictCategory(model, `${input.title} ${input.domain} ${input.description}`);
}
import {
  cleanDescription,
  suggestTags,
  suggestCategoryForResource,
  normalizeTagName,
  canOverwriteDescription,
} from "@/lib/enrichment";

type Client = SupabaseClient<Database>;

export interface EnrichmentResult {
  resource: Resource;
  status: Resource["enrichmentStatus"];
}

/**
 * Runs one resource through the enrichment pipeline: fetch page metadata
 * (SSRF-guarded, see fetchMetadata), then deterministically derive
 * description/tags/category from real evidence only.
 *
 * User-authored fields are never touched: description is only
 * written when they're currently empty or were themselves system-authored
 * (descriptionSource !== "user") — so a manual edit always
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

  const libraryPrediction =
    !resource.categoryId && (await isAiCategorizationEnabled(client, userId))
      ? await predictCategoryFromLibrary(client, userId, {
          title: effectiveTitle,
          domain: resource.domain,
          description: finalDescription,
        })
      : null;

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
      patch.categorySource = "rules";
    }
  }

  if (!patch.categoryId && shouldApplyPrediction(libraryPrediction)) {
    patch.categoryId = libraryPrediction.label;
    patch.categorySource = "ai";
  }

  const gotDescription = !!finalDescription;
  const gotContext = finalTagCount > 0;
  patch.enrichmentStatus = gotDescription && gotContext ? "enriched" : "partial";

  const updated = await updateResource(client, userId, resourceId, patch);
  return { resource: updated, status: patch.enrichmentStatus as Resource["enrichmentStatus"] };
}
