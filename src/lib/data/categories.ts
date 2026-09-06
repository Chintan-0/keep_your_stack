import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Category } from "@/lib/types";

type Client = SupabaseClient<Database>;

/** Categories are a shared, read-only taxonomy — no user scoping needed. */
export async function listCategories(client: Client): Promise<Category[]> {
  const { data, error } = await client.from("categories").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id }));
}
