import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Tag } from "@/lib/types";
import { mapTagRow } from "./mappers";

type Client = SupabaseClient<Database>;

export async function listTags(client: Client, userId: string): Promise<Tag[]> {
  const { data, error } = await client.from("tags").select("*").eq("user_id", userId).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTagRow);
}

/** Upserts each name as a tag owned by userId and returns their ids, in order, deduped. */
export async function ensureTags(client: Client, userId: string, names: string[]): Promise<string[]> {
  const cleaned = Array.from(
    new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))
  );
  if (cleaned.length === 0) return [];

  const { data: existing, error: existingErr } = await client
    .from("tags")
    .select("id, name")
    .eq("user_id", userId)
    .in("name", cleaned);
  if (existingErr) throw new Error(existingErr.message);

  const existingNames = new Set((existing ?? []).map((t) => t.name));
  const toCreate = cleaned.filter((n) => !existingNames.has(n));

  let created: { id: string; name: string }[] = [];
  if (toCreate.length) {
    const { data, error } = await client
      .from("tags")
      .insert(toCreate.map((name) => ({ user_id: userId, name })))
      .select("id, name");
    if (error) throw new Error(error.message);
    created = data ?? [];
  }

  const byName = new Map<string, string>();
  for (const t of [...(existing ?? []), ...created]) byName.set(t.name, t.id);
  return cleaned.map((n) => byName.get(n)).filter(Boolean) as string[];
}
