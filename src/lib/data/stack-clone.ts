import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createResource } from "./resources";
import type { Pricing, Platform } from "@/lib/types";

type Client = SupabaseClient<Database>;

interface CloneableResource {
  title: string;
  url: string;
  description: string;
  useCases: string[];
  tags: string[];
  pricing: Pricing | null;
  platform: Platform[];
}

export interface CloneResult {
  added: number;
  alreadyInLibrary: number;
  failed: number;
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
): Promise<CloneResult> {
  let added = 0;
  let alreadyInLibrary = 0;
  let failed = 0;

  for (const r of resources) {
    try {
      const { duplicate } = await createResource(destinationClient, destinationUserId, {
        url: r.url,
        title: r.title,
        description: r.description,
        useCases: r.useCases,
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
    } catch {
      failed++;
    }
  }

  return { added, alreadyInLibrary, failed };
}
