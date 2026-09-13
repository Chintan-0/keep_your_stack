// Pure validation, deliberately dependency-free (no "server-only", no
// supabase-js) so it's unit-testable directly and reusable from every
// resource-creation/edit entry point (Add Resource, the extension,
// import, backup restore) via the shared data layer
// (src/lib/data/resources.ts) — one place enforcing these limits rather
// than each caller remembering to. Truncates rather than rejects: an
// oversized field is a sign of bad/malicious input, not a reason to fail
// an otherwise-good save (a 4,000-word "note" pasted by mistake shouldn't
// cost the user their whole resource).

export const MAX_TITLE_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_NOTES_LENGTH = 20000;
export const MAX_USE_CASE_LENGTH = 300;
export const MAX_USE_CASES_COUNT = 30;
export const MAX_TAG_NAME_LENGTH = 60;
export const MAX_TAGS_COUNT = 50;

export function clampTitle(title: string): string {
  return title.slice(0, MAX_TITLE_LENGTH);
}

export function clampDescription(description: string): string {
  return description.slice(0, MAX_DESCRIPTION_LENGTH);
}

export function clampNotes(notes: string): string {
  return notes.slice(0, MAX_NOTES_LENGTH);
}

export function clampUseCases(useCases: string[]): string[] {
  return useCases.slice(0, MAX_USE_CASES_COUNT).map((uc) => uc.slice(0, MAX_USE_CASE_LENGTH));
}

export function clampTagNames(tagNames: string[]): string[] {
  return tagNames.slice(0, MAX_TAGS_COUNT).map((t) => t.slice(0, MAX_TAG_NAME_LENGTH));
}
