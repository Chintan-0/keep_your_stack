import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resource } from "@/lib/types";
import { BACKUP_FORMAT_VERSION, type KeepYourStackBackup } from "@/lib/import/backup";
import { serializeCsv } from "@/lib/import/csv";
import { listResources } from "./resources";
import { listCategories } from "./categories";
import { listStacks } from "./stacks";
import { listTags } from "./tags";

type Client = SupabaseClient<Database>;

export type ExportScope =
  | { type: "all" }
  | { type: "selected"; ids: string[] }
  | { type: "favorites" }
  | { type: "stack"; stackId: string }
  | { type: "category"; categoryId: string };

/** Applies an export scope to the user's full resource list — the one place every export format agrees on "which resources". Never exports another user's data; `resources` is already scoped to `userId` by the caller. */
function applyScope(resources: Resource[], scope: ExportScope): Resource[] {
  switch (scope.type) {
    case "all":
      return resources;
    case "selected": {
      const ids = new Set(scope.ids);
      return resources.filter((r) => ids.has(r.id));
    }
    case "favorites":
      return resources.filter((r) => r.isFavorite);
    case "stack":
      return resources.filter((r) => r.stackIds.includes(scope.stackId));
    case "category":
      return resources.filter((r) => r.categoryId === scope.categoryId);
  }
}

async function loadScopedData(client: Client, userId: string, scope: ExportScope) {
  const [allResources, categories, stacks, tags] = await Promise.all([
    listResources(client, userId),
    listCategories(client, userId),
    listStacks(client, userId),
    listTags(client, userId),
  ]);
  return { resources: applyScope(allResources, scope), categories, stacks, tags };
}

/**
 * The full-backup JSON — see src/lib/import/backup.ts for the format and
 * why every reference inside it (a resource's categoryId, etc.) is only
 * ever meaningful within this same file, never a raw cross-account
 * database id. Never includes anything auth-related — no tokens, no
 * password/session data exists on these tables at all, so there's
 * nothing to accidentally leak here.
 */
export async function buildBackup(client: Client, userId: string, scope: ExportScope = { type: "all" }): Promise<KeepYourStackBackup> {
  const { resources, categories, stacks, tags } = await loadScopedData(client, userId, scope);

  return {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    categories: categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId })),
    stacks: stacks.map((s) => ({ id: s.id, name: s.name, description: s.description, icon: s.icon, color: s.color })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
    resources: resources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      useCases: r.useCases,
      notes: r.notes,
      categoryId: r.categoryId,
      tagIds: r.tagIds,
      stackIds: r.stackIds,
      isFavorite: r.isFavorite,
      isArchived: r.isArchived,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      importSource: r.importSource,
      importFolder: r.importFolder,
      importSourceId: r.importSourceId,
    })),
  };
}

const CSV_HEADER = ["Title", "URL", "Description", "Useful For", "Notes", "Category", "Tags", "Stacks", "Favorite", "Archived", "Created At", "Updated At"];

function categoryPathFor(categoryId: string | null, categories: { id: string; name: string; parentId: string | null }[]): string {
  if (!categoryId) return "";
  const leaf = categories.find((c) => c.id === categoryId);
  if (!leaf) return "";
  const parent = leaf.parentId ? categories.find((c) => c.id === leaf.parentId) : null;
  return parent ? `${parent.name} / ${leaf.name}` : leaf.name;
}

export async function buildExportCsv(client: Client, userId: string, scope: ExportScope = { type: "all" }): Promise<string> {
  const { resources, categories, stacks, tags } = await loadScopedData(client, userId, scope);
  const rows = resources.map((r) => [
    r.title,
    r.url,
    r.description,
    r.useCases.join("; "),
    r.notes,
    categoryPathFor(r.categoryId, categories),
    r.tagIds.map((id) => tags.find((t) => t.id === id)?.name ?? "").filter(Boolean).join("; "),
    r.stackIds.map((id) => stacks.find((s) => s.id === id)?.name ?? "").filter(Boolean).join("; "),
    r.isFavorite ? "yes" : "no",
    r.isArchived ? "yes" : "no",
    r.createdAt,
    r.updatedAt,
  ]);
  return serializeCsv([CSV_HEADER, ...rows]);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * A standard Netscape bookmark file — the same format every browser
 * (and this app's own importer) reads, so the export is immediately
 * useful for migrating to or backing up into any other bookmark manager.
 * Folders reflect Category → Subcategory, matching exactly what the
 * importer itself reads a folder path as — an export→import round trip
 * naturally reconstructs the same organization. Stack membership isn't
 * representable here (a resource can belong to several stacks at once;
 * the bookmark-folder model can't express "in two places without being
 * duplicated" without literally duplicating the bookmark) — this is a
 * real, documented limitation of the format, not something skipped.
 */
export async function buildExportHtml(client: Client, userId: string, scope: ExportScope = { type: "all" }): Promise<string> {
  const { resources, categories } = await loadScopedData(client, userId, scope);

  // Group by full category path, preserving "Uncategorized" as its own bucket.
  const groups = new Map<string, Resource[]>();
  for (const r of resources) {
    const path = categoryPathFor(r.categoryId, categories) || "Uncategorized";
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path)!.push(r);
  }

  const lines: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];

  for (const [path, items] of groups) {
    const segments = path.split(" / ");
    let indent = "    ";
    for (const segment of segments) {
      lines.push(`${indent}<DT><H3>${escapeHtml(segment)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      indent += "    ";
    }
    for (const r of items) {
      const addDate = Math.floor(new Date(r.createdAt).getTime() / 1000);
      lines.push(`${indent}<DT><A HREF="${escapeHtml(r.url)}" ADD_DATE="${addDate}">${escapeHtml(r.title)}</A>`);
    }
    for (let i = segments.length - 1; i >= 0; i--) {
      indent = indent.slice(4);
      lines.push(`${indent}</DL><p>`);
    }
  }

  lines.push("</DL><p>");
  return lines.join("\n") + "\n";
}
