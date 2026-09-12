import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { listCategories, createCategory } from "./categories";
import { listStacks, createStack } from "./stacks";
import type { BackupCategory, BackupStack } from "@/lib/import/backup";

type Client = SupabaseClient<Database>;

/**
 * Resolves a JSON backup's own categories/stacks against the *importing
 * user's real, current* taxonomy — matching by name (case-insensitively),
 * creating whatever doesn't already exist, and never once writing a
 * foreign id from the backup file into the database. This is what makes
 * "map foreign IDs safely" (the backup's ids are only ever looked up
 * within its own arrays) concrete: the maps this returns are the only
 * place a backup id and a real database id are ever associated, and
 * that association lives in memory for the duration of one request.
 */
export async function resolveBackupTaxonomy(
  client: Client,
  userId: string,
  input: { categories: BackupCategory[]; stacks: BackupStack[] }
): Promise<{ categoryIdMap: Record<string, string>; stackIdMap: Record<string, string> }> {
  const existingCategories = await listCategories(client, userId);
  const categoryIdMap: Record<string, string> = {};

  // Top-level categories first — a subcategory's real parent must exist
  // before the subcategory itself can be resolved/created against it.
  const topLevel = input.categories.filter((c) => !c.parentId);
  const children = input.categories.filter((c) => c.parentId);

  for (const backupCat of topLevel) {
    const match = existingCategories.find((c) => !c.parentId && c.name.toLowerCase() === backupCat.name.toLowerCase());
    if (match) {
      categoryIdMap[backupCat.id] = match.id;
    } else {
      const created = await createCategory(client, userId, { name: backupCat.name, parentId: null });
      existingCategories.push(created);
      categoryIdMap[backupCat.id] = created.id;
    }
  }

  for (const backupCat of children) {
    const realParentId = backupCat.parentId ? categoryIdMap[backupCat.parentId] : null;
    if (!realParentId) {
      // The backup's own parent reference didn't resolve (a malformed or
      // hand-edited file) — fall back to a top-level category with this
      // name rather than dropping it or guessing at a parent.
      const match = existingCategories.find((c) => !c.parentId && c.name.toLowerCase() === backupCat.name.toLowerCase());
      if (match) {
        categoryIdMap[backupCat.id] = match.id;
      } else {
        const created = await createCategory(client, userId, { name: backupCat.name, parentId: null });
        existingCategories.push(created);
        categoryIdMap[backupCat.id] = created.id;
      }
      continue;
    }
    const match = existingCategories.find(
      (c) => c.parentId === realParentId && c.name.toLowerCase() === backupCat.name.toLowerCase()
    );
    if (match) {
      categoryIdMap[backupCat.id] = match.id;
    } else {
      const created = await createCategory(client, userId, { name: backupCat.name, parentId: realParentId });
      existingCategories.push(created);
      categoryIdMap[backupCat.id] = created.id;
    }
  }

  const existingStacks = await listStacks(client, userId);
  const stackIdMap: Record<string, string> = {};
  for (const backupStack of input.stacks) {
    const match = existingStacks.find((s) => s.name.toLowerCase() === backupStack.name.toLowerCase());
    if (match) {
      stackIdMap[backupStack.id] = match.id;
    } else {
      const created = await createStack(client, userId, {
        name: backupStack.name,
        description: backupStack.description,
        icon: backupStack.icon,
        color: backupStack.color,
      });
      existingStacks.push(created);
      stackIdMap[backupStack.id] = created.id;
    }
  }

  return { categoryIdMap, stackIdMap };
}
