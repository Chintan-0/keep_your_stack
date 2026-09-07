// Pure validation, deliberately dependency-free (no "server-only", no
// supabase-js) so it can be unit-tested directly and reused from both the
// server-side data layer (src/lib/data/categories.ts) and, if ever needed,
// client-side pre-checks.

export const MAX_CATEGORY_NAME_LENGTH = 60;

export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateCategoryName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = normalizeCategoryName(raw);
  if (!name) return { ok: false, error: "Give it a name first." };
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_CATEGORY_NAME_LENGTH} characters.` };
  }
  return { ok: true, name };
}
