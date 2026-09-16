// Stack Studio's auto-organize suggestion engine — deliberately a thin
// wrapper, not a new suggestion system. Every actual judgment (category
// match, tag match, stack match) comes from the same deterministic rules
// already used by ordinary enrichment (src/lib/enrichment.ts) and regular
// bookmark import (src/lib/import-organizer.ts) — Stack Studio's only new
// job is turning those into a labeled confidence + a plain-language
// "why," never inventing a second, parallel judgment of its own.
import type { Category, Stack } from "./types";
import { suggestCategoryForResource, suggestTags, type Confidence } from "./enrichment";
import { suggestStackForFolder, leafFolderName } from "./import-organizer";

export interface OrganizeSuggestion {
  categoryId: string | null;
  confidence: Confidence | "none";
  /** Plain-language, always literally true — never a claim the system can't back up (Part N). */
  reasons: string[];
  stackId: string | null;
  newStackName: string | null;
  tags: string[];
}

export interface OrganizableResource {
  title: string;
  description: string;
  domain: string;
  folder: string | null;
}

export function suggestOrganization(resource: OrganizableResource, categories: Category[], stacks: Stack[]): OrganizeSuggestion {
  const categorySuggestion = suggestCategoryForResource(
    { title: resource.title, description: resource.description, domain: resource.domain, folder: resource.folder },
    categories
  );

  const reasons: string[] = [];
  if (categorySuggestion) {
    if (categorySuggestion.confidence === "high" && resource.folder) {
      reasons.push(`Existing bookmark folder: ${resource.folder}`);
    } else if (categorySuggestion.confidence === "medium") {
      reasons.push("Title or description mentions this category by name");
    } else {
      reasons.push("This domain is commonly filed under this category");
    }
  }

  const stackSuggestion = suggestStackForFolder(resource.folder, stacks);
  if (stackSuggestion.existingStackId) reasons.push(`Matches your existing "${stacks.find((s) => s.id === stackSuggestion.existingStackId)?.name}" stack`);
  else if (stackSuggestion.suggestedName) reasons.push(`Bookmark folder suggests a "${stackSuggestion.suggestedName}" stack`);

  const tags = suggestTags({ title: resource.title, description: resource.description, domain: resource.domain });
  const leaf = leafFolderName(resource.folder);
  if (leaf && !tags.some((t) => t.toLowerCase() === leaf.toLowerCase())) {
    // The folder name itself is a reasonable tag candidate even when it
    // didn't match an existing category/stack — capped so it can't crowd
    // out the real content-based tags above.
    tags.push(leaf.toLowerCase());
  }

  return {
    categoryId: categorySuggestion?.categoryId ?? null,
    confidence: categorySuggestion?.confidence ?? "none",
    reasons,
    stackId: stackSuggestion.existingStackId,
    newStackName: stackSuggestion.suggestedName,
    tags: tags.slice(0, 5),
  };
}

/** Coarse label for the review-queue filter (Part M) — collapses "medium" into "needs review" alongside "none", since only a folder-based exact match is confident enough to auto-apply without a second look. */
export function reviewBucket(confidence: Confidence | "none"): "confident" | "review" {
  return confidence === "high" ? "confident" : "review";
}
