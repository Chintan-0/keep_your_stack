import type { Database } from "@/lib/supabase/types";
import type { Resource, Stack, Tag } from "@/lib/types";

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"] & {
  resource_tags?: { tag_id: string }[] | null;
  resource_stacks?: { stack_id: string }[] | null;
};

export function mapResourceRow(row: ResourceRow): Resource {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    domain: row.domain,
    description: row.description,
    faviconLetter: row.title.charAt(0).toUpperCase(),
    categoryId: row.category_id,
    useCases: row.use_cases ?? [],
    notes: row.notes ?? "",
    tagIds: (row.resource_tags ?? []).map((t) => t.tag_id),
    stackIds: (row.resource_stacks ?? []).map((s) => s.stack_id),
    pricing: (row.pricing as Resource["pricing"]) ?? null,
    platform: (row.platform as Resource["platform"]) ?? null,
    isFavorite: row.is_favorite,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    useCount: row.use_count,
    importSource: row.import_source,
    importFolder: row.import_folder,
    importSourceId: row.import_source_id,
    descriptionSource: (row.description_source as Resource["descriptionSource"]) ?? null,
    usefulForSource: (row.useful_for_source as Resource["usefulForSource"]) ?? null,
    enrichmentStatus: (row.enrichment_status as Resource["enrichmentStatus"]) ?? "pending",
    enrichmentAttempts: row.enrichment_attempts ?? 0,
    enrichmentAttemptedAt: row.enrichment_attempted_at,
    needsReviewDismissed: row.needs_review_dismissed ?? false,
  };
}

export function mapStackRow(row: Database["public"]["Tables"]["stacks"]["Row"]): Stack {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    visibility: (row.visibility as Stack["visibility"]) ?? "private",
    slug: row.slug,
    createdAt: row.created_at,
  };
}

export function mapTagRow(row: Database["public"]["Tables"]["tags"]["Row"]): Tag {
  return { id: row.id, name: row.name };
}

export const RESOURCE_SELECT = "*, resource_tags(tag_id), resource_stacks(stack_id)";
