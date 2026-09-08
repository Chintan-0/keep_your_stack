import { getSession, getSettings, setSession } from "./storage";
import type { ExtStack, SaveInput, SaveResult } from "./types";

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

export async function checkConnection(): Promise<{ email: string | null } | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const res = await authedFetch("/api/account");
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.user?.email ?? null };
  } catch {
    return null;
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

export async function saveResource(input: SaveInput): Promise<SaveResult> {
  const res = await authedFetch("/api/resources", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error || "Couldn't save this page.", res.status);
  }
  return res.json();
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
