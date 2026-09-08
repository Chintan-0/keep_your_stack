import "server-only";

// Shared SSRF guard used by both metadata fetching (src/lib/data/
// metadata.ts) and link health checking (src/lib/data/link-check.ts) — one
// implementation, so the two never drift apart on what's safe to fetch.
// Blocks requests aimed at the machine itself or internal networks so
// neither feature can be used as an open SSRF proxy against localhost,
// cloud metadata endpoints (169.254.169.254), or RFC1918/loopback ranges.
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "169.254.169.254") return true; // cloud metadata service
  const ipMatch = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [a, b] = ipMatch.slice(1).map(Number);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true; // IPv6 private/link-local
  return false;
}

export function resolveUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export class UnsafeUrlError extends Error {}

/**
 * A guarded fetch: only http(s), never a blocked host, manual redirect
 * handling so EVERY hop (not just the first URL) is re-validated against
 * the same blocklist — a public URL that redirects to a private one is
 * refused just as if it had been requested directly.
 */
export async function guardedFetch(
  url: string,
  opts: { redirectsLeft: number; timeoutMs: number; method?: "GET" | "HEAD" }
): Promise<{ response: Response; finalUrl: string; redirectCount: number }> {
  let currentUrl = url;
  let redirectsLeft = opts.redirectsLeft;
  let redirectCount = 0;

  for (;;) {
    const parsed = new URL(currentUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new UnsafeUrlError("Unsupported protocol");
    }
    if (isBlockedHost(parsed.hostname)) {
      throw new UnsafeUrlError("Refusing to fetch a local/internal address");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "KeepYourStackBot/1.0 (+link check)" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location || redirectsLeft <= 0) throw new Error("Too many redirects");
      currentUrl = resolveUrl(currentUrl, location);
      redirectsLeft -= 1;
      redirectCount += 1;
      continue;
    }
    return { response: res, finalUrl: currentUrl, redirectCount };
  }
}
