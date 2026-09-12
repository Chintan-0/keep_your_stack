import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { RememberedMapping } from "@/lib/types";

type Client = SupabaseClient<Database>;

function mapRow(row: Database["public"]["Tables"]["remembered_import_mappings"]["Row"]): RememberedMapping {
  return { id: row.id, folderPath: row.folder_path, categoryId: row.category_id };
}

export async function listRememberedMappings(client: Client, userId: string): Promise<RememberedMapping[]> {
  const { data, error } = await client
    .from("remembered_import_mappings")
    .select("*")
    .eq("user_id", userId)
    .order("folder_path");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Upserts "this folder path always means this category" — one row per (user, folder path), so setting it again just updates the target rather than accumulating duplicates. */
export async function rememberMapping(
  client: Client,
  userId: string,
  folderPath: string,
  categoryId: string
): Promise<RememberedMapping> {
  const trimmed = folderPath.trim();
  if (!trimmed) throw new Error("A folder path is required.");

  // A foreign key alone doesn't enforce ownership (FK validation isn't
  // RLS-scoped) — confirm the category is really this user's own before
  // letting a remembered mapping point at it.
  const { data: owned, error: ownedError } = await client
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ownedError) throw new Error(ownedError.message);
  if (!owned) throw new Error("That category doesn't exist.");

  const { data, error } = await client
    .from("remembered_import_mappings")
    .upsert({ user_id: userId, folder_path: trimmed, category_id: categoryId }, { onConflict: "user_id,folder_path" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function forgetMapping(client: Client, userId: string, folderPath: string): Promise<void> {
  const { error } = await client
    .from("remembered_import_mappings")
    .delete()
    .eq("user_id", userId)
    .eq("folder_path", folderPath.trim());
  if (error) throw new Error(error.message);
}
