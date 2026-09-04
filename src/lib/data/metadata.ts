import "server-only";
import { getDomain, normalizeUrl } from "@/lib/utils";

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

// Blocks requests aimed at the machine itself or internal networks, so this
// route can't be used as an open SSRF proxy against localhost, cloud
// metadata endpoints (169.254.169.254), or RFC1918/loopback ranges.
function isBlockedHost(hostname: string): boolean {
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

function resolveUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

async function fetchWithGuards(url: string, redirectsLeft: number): Promise<Response> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Unsupported protocol");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("Refusing to fetch a local/internal address");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "KeepYourStackBot/1.0 (+metadata fetch)" },
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location || redirectsLeft <= 0) throw new Error("Too many redirects");
      return fetchWithGuards(resolveUrl(url, location), redirectsLeft - 1);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMetadata(
  rawUrl: string
): Promise<{ ok: true; data: FetchedMetadata } | { ok: false; domain: string }> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return { ok: false, domain: rawUrl };
  const domain = getDomain(normalized);

  try {
    const res = await fetchWithGuards(normalized, MAX_REDIRECTS);
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
