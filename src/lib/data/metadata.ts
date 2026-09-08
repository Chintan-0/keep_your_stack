import "server-only";
import { getDomain, normalizeUrl } from "@/lib/utils";
import { guardedFetch, resolveUrl } from "./http-guard";

export interface FetchedMetadata {
  title: string;
  description: string;
  domain: string;
  faviconUrl: string | null;
  imageUrl: string | null;
}

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 2_000_000; // 2MB cap on what we'll read of the response body
const MAX_REDIRECTS = 3;

function extract(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'");
}

export async function fetchMetadata(
  rawUrl: string
): Promise<{ ok: true; data: FetchedMetadata } | { ok: false; domain: string }> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return { ok: false, domain: rawUrl };
  const domain = getDomain(normalized);

  try {
    const { response: res } = await guardedFetch(normalized, { redirectsLeft: MAX_REDIRECTS, timeoutMs: FETCH_TIMEOUT_MS });
    if (!res.ok || !res.body) return { ok: false, domain };

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { ok: true, data: { title: domain, description: "", domain, faviconUrl: null, imageUrl: null } };
    }

    // Read only up to MAX_BYTES — metadata always lives in <head>, no need
    // to buffer a whole large page.
    const reader = res.body.getReader();
    let received = 0;
    let html = "";
    const decoder = new TextDecoder();
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});

    const title = extract(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
      /<title[^>]*>([^<]*)<\/title>/i,
    ]);
    const description = extract(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    ]);
    const ogImage = extract(html, [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i]);
    const iconHref = extract(html, [
      /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]+href=["']([^"']*)["']/i,
    ]);

    return {
      ok: true,
      data: {
        title: title || domain,
        description: description || "",
        domain,
        faviconUrl: iconHref ? resolveUrl(normalized, iconHref) : `${new URL(normalized).origin}/favicon.ico`,
        imageUrl: ogImage ? resolveUrl(normalized, ogImage) : null,
      },
    };
  } catch {
    return { ok: false, domain };
  }
}
