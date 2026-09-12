import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ImportHistoryEntry } from "@/lib/types";

type Client = SupabaseClient<Database>;

/** Capped well below anything that would make import_history a second copy of a user's library — this is a record of *that an import happened*, not its contents. */
const MAX_FAILED_ITEMS_STORED = 50;

function mapRow(row: Database["public"]["Tables"]["import_history"]["Row"]): ImportHistoryEntry {
  const failedItems = Array.isArray(row.failed_items)
    ? (row.failed_items as { title: string; url: string; reason: string }[])
    : [];
  return {
    id: row.id,
    source: row.source,
    filename: row.filename,
    total: row.total,
    imported: row.imported,
    skipped: row.skipped,
    failed: row.failed,
    failedItems,
    createdAt: row.created_at,
  };
}

export async function listImportHistory(client: Client, userId: string): Promise<ImportHistoryEntry[]> {
  const { data, error } = await client
    .from("import_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export interface RecordImportInput {
  source: string;
  filename?: string | null;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  failedItems?: { title: string; url: string; reason: string }[];
}

export async function recordImport(client: Client, userId: string, input: RecordImportInput): Promise<ImportHistoryEntry> {
  const { data, error } = await client
    .from("import_history")
    .insert({
      user_id: userId,
      source: input.source,
      filename: input.filename ?? null,
      total: input.total,
      imported: input.imported,
      skipped: input.skipped,
      failed: input.failed,
      failed_items: (input.failedItems ?? []).slice(0, MAX_FAILED_ITEMS_STORED),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}
