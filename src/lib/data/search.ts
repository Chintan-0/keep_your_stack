import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource, SearchMatch } from "@/lib/types";
import { mapResourceRow, RESOURCE_SELECT } from "./mappers";

type Client = SupabaseClient<Database>;

interface SearchRpcRow {
  resource_id: string;
  rank: number;
  matched_title: boolean;
  matched_use_cases: boolean;
  matched_tags: boolean;
  matched_category: boolean;
  matched_stacks: boolean;
  matched_description: boolean;
  matched_notes: boolean;
}

/**
 * Runs the Postgres full-text + trigram search (search_resources, see
 * supabase/migrations) and reports which fields actually matched, so the
 * UI's "Matches: ..." line is generated from real data, not guessed.
 */
export async function searchResources(client: Client, query: string): Promise<SearchMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data: matches, error } = await client.rpc("search_resources", { p_query: trimmed });
  if (error) throw new Error(error.message);
  const rows = (matches ?? []) as SearchRpcRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.resource_id);
  const { data: resourceRows, error: resErr } = await client
    .from("resources")
    .select(RESOURCE_SELECT)
    .in("id", ids);
  if (resErr) throw new Error(resErr.message);

  const byId = new Map<string, Resource>((resourceRows ?? []).map((r) => [r.id, mapResourceRow(r)]));

  const results: SearchMatch[] = [];
  for (const row of rows) {
    const resource = byId.get(row.resource_id);
    if (!resource) continue;

    const matchedOn: string[] = [];
    if (row.matched_title) matchedOn.push(resource.title);
    if (row.matched_use_cases) matchedOn.push("Useful for");
    if (row.matched_tags) matchedOn.push("Tags");
    if (row.matched_category) matchedOn.push("Category");
    if (row.matched_stacks) matchedOn.push("Stack");
    if (row.matched_notes) matchedOn.push("Your note");
    // Description matches are real but not surfaced as a label — same
    // convention as the original client-side search, which treated it as
    // the least specific signal.
    if (matchedOn.length === 0 && row.matched_description) matchedOn.push("Description");

    results.push({ resource, score: row.rank, matchedOn: matchedOn.slice(0, 4) });
  }
  return results;
}
