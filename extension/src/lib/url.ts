// Kept byte-for-byte in sync with src/lib/utils.ts's normalizeUrl/getDomain.
// The extension can't import that file directly (it pulls in clsx/
// tailwind-merge, which need a bundler to resolve in a browser ES module
// context), so the logic is duplicated here instead — url.test.ts asserts
// both implementations agree on the same inputs, which is what actually
// guarantees "the extension and web app treat the same URL as the same
// resource" rather than just hoping the two copies never drift.

export function normalizeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const u = new URL(value);
    u.hash = "";
    if (u.pathname === "/") u.pathname = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Schemes Chrome (and other Chromium browsers) use for internal/privileged
// pages that can never be fetched or saved as a resource. `normalizeUrl`
// itself only accepts http(s), so this mostly matters for producing a
// clear, specific message instead of the generic "invalid URL" one.
const UNSUPPORTED_SCHEMES = [
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "file:",
  "view-source:",
  "devtools:",
  "data:",
];

export function isSupportedUrl(raw: string): boolean {
  let scheme: string;
  try {
    scheme = new URL(raw).protocol;
  } catch {
    return false;
  }
  if (UNSUPPORTED_SCHEMES.includes(scheme)) return false;
  return scheme === "http:" || scheme === "https:";
}
