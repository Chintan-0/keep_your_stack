import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildResources, stacks as demoStacks, tags as demoTags } from "@/lib/mock-data";
import { createStack } from "./stacks";
import { createResource } from "./resources";

type Client = SupabaseClient<Database>;

/**
 * Seeds the realistic sample dataset (from src/lib/mock-data.ts — the same
 * data the local-only build shipped with) into an authenticated user's
 * otherwise-empty account. Never runs automatically; only in response to
 * an explicit "Load Demo Data" action, and duplicate URLs are skipped
 * rather than double-created if it's ever run more than once.
 */
export async function loadDemoData(client: Client, userId: string): Promise<{ stacks: number; resources: number }> {
  const stackIdMap = new Map<string, string>();
  for (const stack of demoStacks) {
    const created = await createStack(client, userId, {
      name: stack.name,
      description: stack.description,
      icon: stack.icon,
      color: stack.color,
    });
    stackIdMap.set(stack.id, created.id);
  }

  const tagNameById = new Map(demoTags.map((t) => [t.id, t.name]));
  let resourceCount = 0;

  for (const resource of buildResources()) {
    const { duplicate } = await createResource(client, userId, {
      url: resource.url,
      title: resource.title,
      description: resource.description,
      categoryId: resource.categoryId,
      useCases: resource.useCases,
      notes: resource.notes,
      tagNames: resource.tagIds.map((id) => tagNameById.get(id)).filter(Boolean) as string[],
      stackIds: resource.stackIds.map((id) => stackIdMap.get(id)).filter(Boolean) as string[],
      pricing: resource.pricing,
      platform: resource.platform,
      isFavorite: resource.isFavorite,
      isArchived: resource.isArchived,
    });
    if (!duplicate) resourceCount++;
  }

  return { stacks: stackIdMap.size, resources: resourceCount };
}
