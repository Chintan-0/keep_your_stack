import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { guardedFetch, UnsafeUrlError } from "./http-guard";

type Client = SupabaseClient<Database>;

export type LinkStatus = "healthy" | "redirected" | "unavailable" | "timeout" | "blocked" | "unknown";

export interface LinkCheckResult {
  status: LinkStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  redirectCount: number;
  error: string | null;
  checkedAt: string;
}

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
// A single failed check is retried before it's shown as broken — a
// temporary blip (the site's own outage, a transient DNS hiccup) must not
// immediately read as "unavailable". Only a second consecutive failure
// does.
const FAILURES_BEFORE_UNAVAILABLE = 2;

async function probe(url: string): Promise<LinkCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    // HEAD first (cheap — we only need a status code, not a body), falling
    // back to GET for servers that don't implement HEAD (a real, common
    // case — many sites 405 it).
    let { response, finalUrl, redirectCount } = await guardedFetch(url, {
      redirectsLeft: MAX_REDIRECTS,
      timeoutMs: TIMEOUT_MS,
      method: "HEAD",
    });
    if (response.status === 405 || response.status === 501) {
      ({ response, finalUrl, redirectCount } = await guardedFetch(url, {
        redirectsLeft: MAX_REDIRECTS,
        timeoutMs: TIMEOUT_MS,
        method: "GET",
      }));
    }

    if (response.status === 401 || response.status === 403) {
      return { status: "blocked", httpStatus: response.status, finalUrl, redirectCount, error: null, checkedAt };
    }
    if (!response.ok) {
      return {
        status: "unavailable",
        httpStatus: response.status,
        finalUrl,
        redirectCount,
        error: `HTTP ${response.status}`,
        checkedAt,
      };
    }
    return {
      status: redirectCount > 0 ? "redirected" : "healthy",
      httpStatus: response.status,
      finalUrl,
      redirectCount,
      error: null,
      checkedAt,
    };
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return { status: "blocked", httpStatus: null, finalUrl: null, redirectCount: 0, error: e.message, checkedAt };
    }
    if (e instanceof Error && e.name === "AbortError") {
      return { status: "timeout", httpStatus: null, finalUrl: null, redirectCount: 0, error: "Request timed out", checkedAt };
    }
    // A generic fetch failure here means the connection itself never
    // succeeded — DNS couldn't resolve, the connection was refused, TLS
    // failed, etc. That's a real signal the link is down, not merely
    // ambiguous, so it must count as a failure (same as an HTTP error
    // status) or a persistently-unreachable domain would report "unknown"
    // forever instead of ever reaching "unavailable".
    return {
      status: "unavailable",
      httpStatus: null,
      finalUrl: null,
      redirectCount: 0,
      error: e instanceof Error ? e.message : "Check failed",
      checkedAt,
    };
  }
}

export interface StoredLinkCheck {
  status: LinkStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  redirectCount: number;
  error: string | null;
  consecutiveFailures: number;
  checkedAt: string | null;
}

function mapRow(row: Database["public"]["Tables"]["resource_link_checks"]["Row"] | null): StoredLinkCheck {
  if (!row) {
    return { status: "unknown", httpStatus: null, finalUrl: null, redirectCount: 0, error: null, consecutiveFailures: 0, checkedAt: null };
  }
  return {
    status: row.status as LinkStatus,
    httpStatus: row.http_status,
    finalUrl: row.final_url,
    redirectCount: row.redirect_count,
    error: row.error,
    consecutiveFailures: row.consecutive_failures,
    checkedAt: row.checked_at,
  };
}

export async function getLinkCheck(client: Client, userId: string, resourceId: string): Promise<StoredLinkCheck> {
  const { data, error } = await client
    .from("resource_link_checks")
    .select("*")
    .eq("resource_id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

/**
 * Checks one resource's URL and persists the result. A single failure is
 * recorded but reported as "unknown"/kept as its previous status rather
 * than immediately "unavailable" — see FAILURES_BEFORE_UNAVAILABLE. Also
 * clears needs_review_dismissed, since a link going from healthy to
 * broken (or vice versa) is exactly the kind of change that should
 * resurface a previously-dismissed review item.
 */
export async function checkResourceLink(client: Client, userId: string, resourceId: string, url: string): Promise<StoredLinkCheck> {
  const previous = await getLinkCheck(client, userId, resourceId);
  const result = await probe(url);

  const isFailure = result.status === "unavailable" || result.status === "timeout";
  const consecutiveFailures = isFailure ? previous.consecutiveFailures + 1 : 0;
  // Downgrade a first-time failure: keep it out of "unavailable" until it
  // fails twice in a row, so a single blip doesn't alarm the user.
  const reportedStatus: LinkStatus =
    isFailure && consecutiveFailures < FAILURES_BEFORE_UNAVAILABLE ? "unknown" : result.status;

  const { error: upsertError } = await client.from("resource_link_checks").upsert(
    {
      resource_id: resourceId,
      user_id: userId,
      status: reportedStatus,
      http_status: result.httpStatus,
      final_url: result.finalUrl,
      redirect_count: result.redirectCount,
      error: result.error,
      consecutive_failures: consecutiveFailures,
      checked_at: result.checkedAt,
    },
    { onConflict: "resource_id" }
  );
  if (upsertError) throw new Error(upsertError.message);

  await client
    .from("resources")
    .update({ needs_review_dismissed: false })
    .eq("id", resourceId)
    .eq("user_id", userId);

  return {
    status: reportedStatus,
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    redirectCount: result.redirectCount,
    error: result.error,
    consecutiveFailures,
    checkedAt: result.checkedAt,
  };
}

export async function listLinkChecks(client: Client, userId: string): Promise<Map<string, StoredLinkCheck>> {
  const { data, error } = await client.from("resource_link_checks").select("*").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const map = new Map<string, StoredLinkCheck>();
  for (const row of data ?? []) map.set(row.resource_id, mapRow(row));
  return map;
}
