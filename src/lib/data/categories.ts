import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Category } from "@/lib/types";
import { validateCategoryName } from "@/lib/category-validation";

type Client = SupabaseClient<Database>;

export { validateCategoryName, normalizeCategoryName, MAX_CATEGORY_NAME_LENGTH } from "@/lib/category-validation";

function mapRow(row: Database["public"]["Tables"]["categories"]["Row"]): Category {
  return { id: row.id, name: row.name, parentId: row.parent_id, sortOrder: row.sort_order };
}

export async function listCategories(client: Client, userId: string): Promise<Category[]> {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

async function getOwnCategory(client: Client, userId: string, id: string) {
  const { data, error } = await client.from("categories").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
}

async function hasDuplicateSibling(
  client: Client,
  userId: string,
  name: string,
  parentId: string | null,
  excludeId?: string
) {
  let query = client.from("categories").select("id").eq("user_id", userId).ilike("name", name);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function createCategory(
  client: Client,
  userId: string,
  input: { name: string; parentId?: string | null }
): Promise<Category> {
  const validated = validateCategoryName(input.name);
  if (!validated.ok) throw new Error(validated.error);

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await getOwnCategory(client, userId, input.parentId);
    if (!parent) throw new Error("That category doesn't exist.");
    if (parent.parentId !== null) {
      throw new Error("Subcategories can't have their own subcategories — pick a top-level category instead.");
    }
    parentId = parent.id;
  }

  if (await hasDuplicateSibling(client, userId, validated.name, parentId)) {
    throw new Error(`"${validated.name}" already exists ${parentId ? "in this category" : "at the top level"}.`);
  }

  // New siblings go after whatever's already there.
  let countQuery = client.from("categories").select("id", { count: "exact", head: true }).eq("user_id", userId);
  countQuery = parentId ? countQuery.eq("parent_id", parentId) : countQuery.is("parent_id", null);
  const { count } = await countQuery;

  const { data, error } = await client
    .from("categories")
    .insert({ user_id: userId, name: validated.name, parent_id: parentId, sort_order: count ?? 0 })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`"${validated.name}" already exists.`);
    throw new Error(error.message);
  }
  return mapRow(data);
}

export async function renameCategory(client: Client, userId: string, id: string, rawName: string): Promise<Category> {
  const validated = validateCategoryName(rawName);
  if (!validated.ok) throw new Error(validated.error);

  const current = await getOwnCategory(client, userId, id);
  if (!current) throw new Error("Category not found.");

  if (await hasDuplicateSibling(client, userId, validated.name, current.parentId, id)) {
    throw new Error(`"${validated.name}" already exists ${current.parentId ? "in this category" : "at the top level"}.`);
  }

  const { data, error } = await client
    .from("categories")
    .update({ name: validated.name })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`"${validated.name}" already exists.`);
    throw new Error(error.message);
  }
  return mapRow(data);
}

/** Moves a subcategory to a different top-level category, or promotes it to top-level (parentId: null). */
export async function moveCategory(
  client: Client,
  userId: string,
  id: string,
  parentId: string | null
): Promise<Category> {
  const current = await getOwnCategory(client, userId, id);
  if (!current) throw new Error("Category not found.");
  if (parentId === id) throw new Error("A category can't be its own parent.");

  const children = await listCategories(client, userId).then((all) => all.filter((c) => c.parentId === id));

  if (parentId) {
    const parent = await getOwnCategory(client, userId, parentId);
    if (!parent) throw new Error("That category doesn't exist.");
    if (parent.parentId !== null) {
      throw new Error("Subcategories can't be nested under another subcategory.");
    }
    if (children.length > 0) {
      throw new Error("This category has its own subcategories — move or remove them first.");
    }
  }

  if (await hasDuplicateSibling(client, userId, current.name, parentId, id)) {
    throw new Error(`"${current.name}" already exists in the destination.`);
  }

  const { data, error } = await client
    .from("categories")
    .update({ parent_id: parentId })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function reorderCategory(
  client: Client,
  userId: string,
  id: string,
  direction: "up" | "down"
): Promise<void> {
  const current = await getOwnCategory(client, userId, id);
  if (!current) throw new Error("Category not found.");

  const siblings = (await listCategories(client, userId))
    .filter((c) => c.parentId === current.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((c) => c.id === id);
  const swapWith = direction === "up" ? siblings[index - 1] : siblings[index + 1];
  if (!swapWith) return; // already at an end — nothing to do

  const { error: e1 } = await client
    .from("categories")
    .update({ sort_order: swapWith.sortOrder })
    .eq("id", current.id)
    .eq("user_id", userId);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await client
    .from("categories")
    .update({ sort_order: current.sortOrder })
    .eq("id", swapWith.id)
    .eq("user_id", userId);
  if (e2) throw new Error(e2.message);
}

export interface DeleteCategoryResult {
  movedResources: number;
  deletedSubcategories: number;
}

/**
 * Deletes a category (and, if it's a top-level one, its subcategories).
 * Every resource that pointed at it or any of its subcategories is
 * reassigned to `reassignTo` (or to "No category" if null) first — nothing
 * is ever silently deleted just because its category was.
 */
export async function deleteCategory(
  client: Client,
  userId: string,
  id: string,
  reassignTo: string | null
): Promise<DeleteCategoryResult> {
  const current = await getOwnCategory(client, userId, id);
  if (!current) throw new Error("Category not found.");

  if (reassignTo) {
    if (reassignTo === id) throw new Error("Can't reassign a category's resources to itself.");
    const target = await getOwnCategory(client, userId, reassignTo);
    if (!target) throw new Error("That destination category doesn't exist.");
  }

  const children = (await listCategories(client, userId)).filter((c) => c.parentId === id);
  const idsToClear = [id, ...children.map((c) => c.id)];

  const { data: moved, error: moveError } = await client
    .from("resources")
    .update({ category_id: reassignTo })
    .eq("user_id", userId)
    .in("category_id", idsToClear)
    .select("id");
  if (moveError) throw new Error(moveError.message);

  if (children.length > 0) {
    const { error: delChildrenError } = await client
      .from("categories")
      .delete()
      .eq("user_id", userId)
      .in(
        "id",
        children.map((c) => c.id)
      );
    if (delChildrenError) throw new Error(delChildrenError.message);
  }

  const { error: delError } = await client.from("categories").delete().eq("id", id).eq("user_id", userId);
  if (delError) throw new Error(delError.message);

  return { movedResources: moved?.length ?? 0, deletedSubcategories: children.length };
}
