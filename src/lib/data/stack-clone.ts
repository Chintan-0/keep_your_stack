import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createResource, bulkAddToStack } from "./resources";
import { createStack } from "./stacks";
import type { Pricing, Platform } from "@/lib/types";

type Client = SupabaseClient<Database>;

interface CloneableResource {
  title: string;
  url: string;
  description: string;
  tags: string[];
  pricing: Pricing | null;
  platform: Platform[];
}

export interface CloneResult {
  added: number;
  alreadyInLibrary: number;
  failed: number;
}

export interface CloneSource {
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface StackCloneResult extends CloneResult {
  stackId: string;
  stackName: string;
}

/**
 * Copies public resources into `destinationUserId`'s own library.
 * Deliberately reuses createResource() rather than a bespoke insert path
 * — that's the existing, already-tested duplicate-prevention mechanism
 * (a unique index on (user_id, normalized_url), checked server-side), so
 * "handle duplicates safely" (Part F) falls out of the existing
 * architecture instead of a second, parallel implementation. Every
 * created row's user_id is destinationUserId — there is no field on
 * Resource that could reference the original owner, so a cloned resource
 * belongs entirely to the new user by construction, not by convention.
 * Notes are never read from the source at all (not merely stripped) —
 * loadStackResources (public-stacks.ts) never selects that column for a
 * public/unlisted view in the first place.
 */
export async function cloneResourcesToUser(
  destinationClient: Client,
  destinationUserId: string,
  resources: CloneableResource[]
): Promise<CloneResult & { resourceIds: string[] }> {
  let added = 0;
  let alreadyInLibrary = 0;
  let failed = 0;
  const resourceIds: string[] = [];

  for (const r of resources) {
    try {
      const { resource, duplicate } = await createResource(destinationClient, destinationUserId, {
        url: r.url,
        title: r.title,
        description: r.description,
        tagNames: r.tags,
        pricing: r.pricing,
        platform: r.platform,
        // categoryId intentionally omitted — the source category is this
        // user's own taxonomy, not the destination user's; forcing it in
        // would either collide with an unrelated category of the same
        // name or silently fail a foreign-key check. The destination user
        // can categorize the resource themselves after saving, same as
        // any other new resource.
      });
      if (duplicate) alreadyInLibrary++;
      else added++;
      resourceIds.push(resource.id);
    } catch {
      failed++;
    }
  }

  return { added, alreadyInLibrary, failed, resourceIds };
}

/**
 * Whole-stack clone: copies the resources into the library (existing ones are reused, never duplicated) and creates a
 * private stack holding them. A repeat clone gets a new stack name with a numeric suffix, so the earlier copy is never overwritten.
 */
export async function cloneStackToUser(
  client: Client,
  userId: string,
  source: CloneSource,
  resources: CloneableResource[]
): Promise<StackCloneResult> {
  const result = await cloneResourcesToUser(client, userId, resources);

  const { data: existing, error } = await client.from("stacks").select("name").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const taken = new Set((existing ?? []).map((s) => s.name));
  let name = source.name.slice(0, 80) || "Cloned stack";
  for (let n = 2; taken.has(name); n++) name = `${source.name.slice(0, 70)} (${n})`;

  const stack = await createStack(client, userId, {
    name,
    description: source.description,
    icon: source.icon,
    color: source.color,
  });
  await bulkAddToStack(client, userId, result.resourceIds, stack.id);

  return { added: result.added, alreadyInLibrary: result.alreadyInLibrary, failed: result.failed, stackId: stack.id, stackName: stack.name };
}
