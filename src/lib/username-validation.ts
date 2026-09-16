// Pure validation, deliberately dependency-free (no "server-only", no
// supabase-js) so it's unit-testable directly — same convention as
// resource-validation.ts / category-validation.ts. Enforces everything
// the DB's own check constraint does (see
// supabase/migrations/20260101000012_shareable_stacks.sql) PLUS the
// reserved-word check the database can't know about — a username of
// "admin" is a perfectly shaped string, but /@admin would collide with
// (or attempt to impersonate) real app routes if allowed.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

// Every top-level route this app actually has or plausibly will, plus
// generic system/impersonation-risk words — checked case-insensitively.
// Deliberately broad rather than narrow: a false-positive here just means
// a user picks a different handle; a false-negative could let someone
// claim /@admin or /@api.
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "app", "auth", "settings", "setting",
  "extension", "download", "downloads", "share", "shared", "public",
  "profile", "profiles", "account", "accounts", "user", "users",
  "resources", "resource", "categories", "category", "stacks", "stack",
  "tags", "tag", "favorites", "favourite", "favourites", "archive",
  "archived", "recent", "search", "import", "export", "library",
  "dashboard", "home", "login", "logout", "signup", "signin", "sign-up",
  "sign-in", "register", "forgot-password", "reset-password", "callback",
  "static", "assets", "images", "img", "css", "js", "favicon",
  "supabase", "vercel", "keepyourstack", "keep-your-stack", "system",
  "root", "support", "help", "about", "contact", "terms", "privacy",
  "null", "undefined", "true", "false", "me", "you", "www",
]);

export type UsernameValidationResult = { ok: true; username: string } | { ok: false; error: string };

/** Normalizes to lowercase (usernames are case-insensitively unique — see the DB's lower(username) index) and validates shape + reserved words. Does NOT check uniqueness against other users — that's a DB round trip, done by the caller. */
export function validateUsername(raw: string): UsernameValidationResult {
  const username = raw.trim().toLowerCase();
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return { ok: false, error: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "Username can only contain lowercase letters, numbers, underscores, and hyphens." };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: "That username isn't available." };
  }
  return { ok: true, username };
}
