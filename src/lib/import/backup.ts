// The KeepYourStack full-backup JSON format — one file with enough
// information to reconstruct a user's library. IDs in this file are only
// ever meaningful *within the file itself* (a resource's categoryId is
// looked up against this same file's categories array) — they are never
// written directly into the database. That's what makes re-importing a
// backup into a different account (or the same account after Clear All
// Data) safe: every reference gets resolved by name against the
// importing user's own real categories/stacks/tags, creating what's
// missing, never trusting a foreign UUID.

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupCategory {
  id: string;
  name: string;
  parentId: string | null;
}

export interface BackupStack {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface BackupTag {
  id: string;
  name: string;
}

export interface BackupResource {
  id: string;
  title: string;
  url: string;
  description: string;
  useCases: string[];
  notes: string;
  categoryId: string | null;
  tagIds: string[];
  stackIds: string[];
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  importSource: string | null;
  importFolder: string | null;
  importSourceId: string | null;
}

export interface KeepYourStackBackup {
  version: number;
  exportedAt: string;
  categories: BackupCategory[];
  stacks: BackupStack[];
  tags: BackupTag[];
  resources: BackupResource[];
}

export const MAX_BACKUP_RESOURCES = 20000;
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024; // 100MB — generous for a JSON text export of a personal library

export type BackupValidationResult =
  | { ok: true; backup: KeepYourStackBackup; warnings: string[] }
  | { ok: false; error: string };

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Validates and normalizes an already-JSON.parse'd value into a
 * KeepYourStackBackup, or reports exactly why it can't. Never throws —
 * every branch here is deliberate, since this is the boundary where
 * arbitrary user-supplied data first gets structural trust decisions
 * made about it. Only ever reads specific, known top-level keys off the
 * parsed object (never spreads or deep-merges the raw input anywhere),
 * which is what keeps this safe from prototype pollution regardless of
 * what an attacker names an extra field.
 */
export function validateBackup(data: unknown): BackupValidationResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "This doesn't look like a KeepYourStack backup file." };
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    return { ok: false, error: "This file is missing a version number and can't be read as a KeepYourStack backup." };
  }
  if (obj.version !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `This backup is format version ${obj.version}, but this version of KeepYourStack only understands version ${BACKUP_FORMAT_VERSION}.`,
    };
  }
  if (!Array.isArray(obj.resources)) {
    return { ok: false, error: "This backup has no resources list." };
  }
  if (obj.resources.length > MAX_BACKUP_RESOURCES) {
    return { ok: false, error: `This backup has ${obj.resources.length} resources — the limit is ${MAX_BACKUP_RESOURCES} per import.` };
  }

  const warnings: string[] = [];

  const categories: BackupCategory[] = Array.isArray(obj.categories)
    ? obj.categories.filter(
        (c): c is BackupCategory =>
          typeof c === "object" && c !== null && isString((c as Record<string, unknown>).id) && isString((c as Record<string, unknown>).name)
      ).map((c) => ({ id: c.id, name: c.name, parentId: isStringOrNull((c as unknown as Record<string, unknown>).parentId) ? ((c as unknown as Record<string, unknown>).parentId as string | null) : null }))
    : [];
  if (Array.isArray(obj.categories) && categories.length !== obj.categories.length) {
    warnings.push("Some categories in this backup were malformed and were skipped.");
  }

  const stacks: BackupStack[] = Array.isArray(obj.stacks)
    ? obj.stacks
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .filter((s) => isString(s.id) && isString(s.name))
        .map((s) => ({
          id: s.id as string,
          name: s.name as string,
          description: isString(s.description) ? s.description : "",
          icon: isString(s.icon) ? s.icon : "📦",
          color: isString(s.color) ? s.color : "accent",
        }))
    : [];

  const tags: BackupTag[] = Array.isArray(obj.tags)
    ? obj.tags
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .filter((t) => isString(t.id) && isString(t.name))
        .map((t) => ({ id: t.id as string, name: t.name as string }))
    : [];

  const categoryIds = new Set(categories.map((c) => c.id));
  const stackIds = new Set(stacks.map((s) => s.id));
  const tagIdSet = new Set(tags.map((t) => t.id));

  const resources: BackupResource[] = [];
  let skippedResources = 0;
  for (const raw of obj.resources) {
    if (typeof raw !== "object" || raw === null) {
      skippedResources++;
      continue;
    }
    const r = raw as Record<string, unknown>;
    if (!isString(r.id) || !isString(r.title) || !isString(r.url)) {
      skippedResources++;
      continue;
    }
    // A reference to a category/stack/tag not present in this same
    // file's own arrays is dropped, not trusted — it can't mean anything
    // safe to write, since these IDs are only meaningful within this file.
    const categoryId = isString(r.categoryId) && categoryIds.has(r.categoryId) ? r.categoryId : null;
    const tagIds = isStringArray(r.tagIds) ? r.tagIds.filter((id) => tagIdSet.has(id)) : [];
    const resourceStackIds = isStringArray(r.stackIds) ? r.stackIds.filter((id) => stackIds.has(id)) : [];

    resources.push({
      id: r.id,
      title: r.title,
      url: r.url,
      description: isString(r.description) ? r.description : "",
      useCases: isStringArray(r.useCases) ? r.useCases : [],
      notes: isString(r.notes) ? r.notes : "",
      categoryId,
      tagIds,
      stackIds: resourceStackIds,
      isFavorite: r.isFavorite === true,
      isArchived: r.isArchived === true,
      createdAt: isString(r.createdAt) ? r.createdAt : new Date().toISOString(),
      updatedAt: isString(r.updatedAt) ? r.updatedAt : new Date().toISOString(),
      importSource: isStringOrNull(r.importSource) ? r.importSource : null,
      importFolder: isStringOrNull(r.importFolder) ? r.importFolder : null,
      importSourceId: isString(r.id) ? r.id : null,
    });
  }
  if (skippedResources > 0) {
    warnings.push(`${skippedResources} resource${skippedResources === 1 ? "" : "s"} in this backup were malformed and were skipped.`);
  }
  if (resources.length === 0) {
    return { ok: false, error: "This backup doesn't contain any usable resources." };
  }

  return {
    ok: true,
    warnings,
    backup: {
      version: obj.version,
      exportedAt: isString(obj.exportedAt) ? obj.exportedAt : new Date().toISOString(),
      categories,
      stacks,
      tags,
      resources,
    },
  };
}
