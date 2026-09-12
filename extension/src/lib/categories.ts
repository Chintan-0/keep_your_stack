// Pure, DOM-free so it's unit-testable — see categories.test.ts. Builds a
// flat, indented list from the user's real category tree (fetched from
// /api/categories — the same dynamic per-user taxonomy the web app uses,
// never a second hard-coded list in the extension).
import type { ExtCategory } from "./types.js";

export interface CategoryOption {
  id: string;
  label: string;
}

export function buildCategoryOptions(categories: ExtCategory[]): CategoryOption[] {
  const byParent = new Map<string | null, ExtCategory[]>();
  for (const c of categories) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const options: CategoryOption[] = [];
  for (const top of byParent.get(null) ?? []) {
    options.push({ id: top.id, label: top.name });
    for (const child of byParent.get(top.id) ?? []) {
      options.push({ id: child.id, label: `${top.name} → ${child.name}` });
    }
  }
  return options;
}
