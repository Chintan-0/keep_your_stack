import "server-only";
import { isBlockedHost, resolveUrl } from "@/lib/url-guard";

export { isBlockedHost, resolveUrl };

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
