import { getSession, getSettings, setSession } from "./storage.js";
import type { ExtCategory, ExtStack, OrganizationSuggestion, SaveInput, SaveResult } from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Thrown when there's no session at all, or refreshing it failed. */
export class AuthError extends Error {}

async function refresh(refreshToken: string): Promise<string | null> {
  const { appUrl } = await getSettings();
  try {
    const res = await fetch(`${appUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      userEmail: (await getSession())?.userEmail ?? null,
    });
    return data.accessToken as string;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch against the KeepYourStack API — same contract the web
 * app itself uses (src/lib/store.ts's `api()` helper), just with a Bearer
 * token instead of a cookie, and one automatic refresh-and-retry on a
 * near-expired or already-401 token rather than failing the user's save.
 */
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await getSession();
  if (!session) throw new AuthError("Not connected");

  const { appUrl } = await getSettings();
  const doFetch = (token: string) =>
    fetch(`${appUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

  let res = await doFetch(session.accessToken);
  if (res.status === 401) {
    const newToken = await refresh(session.refreshToken);
    if (!newToken) {
      await setSession(null);
      throw new AuthError("Session expired");
    }
    res = await doFetch(newToken);
  }
  return res;
}

/**
 * A precise classification of "can this popup reach the account right
 * now?" — kept as one discriminated union rather than collapsing every
 * failure into a single boolean, so the popup can show "Connect your
 * account" (no-session), "Session expired" (had one, it's no longer
 * usable), and "Couldn't connect to KeepYourStack" (a real network/server
 * problem, unrelated to auth) as three genuinely distinct states instead
 * of guessing between them from a stale "have we ever connected before"
 * flag. See resolveInitialView, which is the only place this is consumed.
 */
export type ConnectionStatus =
  | { status: "connected"; email: string | null }
  | { status: "no-session" }
  | { status: "expired" }
  | { status: "network-error" };

export async function checkConnection(): Promise<ConnectionStatus> {
  const session = await getSession();
  if (!session) return { status: "no-session" };
  try {
    const res = await authedFetch("/api/account");
    if (!res.ok) return { status: "network-error" };
    const data = await res.json();
    return { status: "connected", email: data.user?.email ?? null };
  } catch (e) {
    // authedFetch itself already distinguishes "the refresh flow ran and
    // definitively failed" (AuthError) from everything else (offline, DNS
    // failure, the KeepYourStack server being down, a malformed response)
    // — preserve that distinction here instead of flattening both into
    // the same result the way a single bare `catch { return null }` would.
    if (e instanceof AuthError) return { status: "expired" };
    return { status: "network-error" };
  }
}

export async function findExisting(url: string): Promise<SaveResult["resource"] | null> {
  const res = await authedFetch(`/api/resources?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new ApiError("Couldn't check your stack.", res.status);
  const data = await res.json();
  return data.resource ?? null;
}

export async function listStacks(): Promise<ExtStack[]> {
  const res = await authedFetch("/api/stacks");
  if (!res.ok) throw new ApiError("Couldn't load your stacks.", res.status);
  const data = await res.json();
  return data.stacks ?? [];
}

export async function listCategories(): Promise<ExtCategory[]> {
  const res = await authedFetch("/api/categories");
  if (!res.ok) throw new ApiError("Couldn't load your categories.", res.status);
  const data = await res.json();
  return data.categories ?? [];
}

export async function saveResource(input: SaveInput): Promise<SaveResult> {
  const res = await authedFetch("/api/resources", {
    method: "POST",
    // Always tagged as an extension save, never left for the caller to
    // set (or forget to set) — this is what lets the admin dashboard
    // distinguish extension saves from web/manual saves and bookmark
    // imports (resources.import_source).
    body: JSON.stringify({ ...input, importSource: "chrome-extension" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error || "Couldn't save this page.", res.status);
  }
  return res.json();
}

/**
 * Deterministic organization suggestion for a not-yet-saved page — never
 * creates a resource, never waits on a real metadata fetch (see the
 * route's own comment), so it can run in parallel with the duplicate
 * check right when the popup opens. Best-effort: a failure here just
 * means the popup falls back to plain manual selection, same as a failed
 * stacks/categories list already does.
 */
export async function suggestOrganization(url: string, title: string): Promise<OrganizationSuggestion | null> {
  try {
    const res = await authedFetch("/api/resources/suggest", {
      method: "POST",
      body: JSON.stringify({ url, title }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Un-archives a resource — used by the "Already saved in Archive" duplicate view's Restore action. */
export async function restoreResource(resourceId: string): Promise<void> {
  const res = await authedFetch(`/api/resources/${resourceId}`, {
    method: "PATCH",
    body: JSON.stringify({ isArchived: false }),
  });
  if (!res.ok) throw new ApiError("Couldn't restore this resource.", res.status);
}

/** Reverses a just-made save — the success view's optional Undo. Never used for anything but a resource this popup session itself just created. */
export async function deleteResource(resourceId: string): Promise<void> {
  const res = await authedFetch(`/api/resources/${resourceId}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError("Couldn't undo this save.", res.status);
}

/**
 * Fire-and-await enrichment for a just-saved resource — same endpoint and
 * same deterministic rules the web app's import/bulk-enrich uses (see
 * src/lib/data/enrichment.ts). Never blocks the save itself: the popup
 * calls this only *after* saveResource() already succeeded.
 */
export async function enrichResource(resourceId: string): Promise<SaveResult["resource"] | null> {
  try {
    const res = await authedFetch(`/api/resources/${resourceId}/enrich`, { method: "POST" });
    if (!res.ok) return null;
    const body = await res.json();
    return body.resource ?? null;
  } catch {
    return null;
  }
}

export async function resourceUrl(resourceId: string): Promise<string> {
  const { appUrl } = await getSettings();
  return `${appUrl}/resources/${resourceId}`;
}

export async function appAuthUrl(): Promise<string> {
  const { appUrl } = await getSettings();
  return `${appUrl}/extension`;
}
