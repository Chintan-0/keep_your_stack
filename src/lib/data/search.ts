import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource, SearchMatch } from "@/lib/types";
import { mapResourceRow, RESOURCE_SELECT } from "./mappers";
import { buildMatchLabels, type MatchFlags } from "@/lib/search-match-labels";

type Client = SupabaseClient<Database>;

interface SearchRpcRow extends MatchFlags {
  resource_id: string;
  rank: number;
}

/**
 * Runs the Postgres full-text + trigram search (search_resources, see
 * supabase/migrations) and reports which fields actually matched, so the
 * UI's "Why it matched" is generated from real data, never guessed.
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
    results.push({ resource, score: row.rank, matchedOn: buildMatchLabels(row).slice(0, 4) });
  }
  return results;
}

/**
 * "Did you mean" — trigram similarity against the user's OWN title/tag
 * vocabulary (see search_suggest_terms), never a generic dictionary. Only
 * called when the main search comes back empty.
 */
export async function suggestSearchTerms(client: Client, query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await client.rpc("search_suggest_terms", { p_query: trimmed });
  if (error) return []; // best-effort — a failed suggestion must never break the "no results" state
  return ((data ?? []) as { term: string; similarity: number }[]).map((r) => r.term);
}
