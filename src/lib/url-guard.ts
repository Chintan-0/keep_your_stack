// Pure SSRF-guard logic, deliberately dependency-free (no "server-only") so
// it's unit-testable directly, same convention as resource-validation.ts
// and category-validation.ts. src/lib/data/http-guard.ts (server-only)
// re-exports these for the actual fetching code.

function isBlockedIPv4(h: string): boolean {
  if (h === "0.0.0.0") return true;
  if (h === "169.254.169.254") return true; // cloud metadata service
  const ipMatch = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipMatch) return false;
  const [a, b] = ipMatch.slice(1).map(Number);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

/**
 * The WHATWG URL parser itself canonicalizes decimal/hex/octal/short-form
 * IPv4 (e.g. `2130706433`, `0x7f000001`, `127.1`) to plain dotted-decimal
 * before `.hostname` is ever read, so isBlockedIPv4's regex alone already
 * catches every disguised-IPv4 trick. What it does NOT normalize away is
 * an IPv4 address wrapped in IPv6 "mapped address" notation — `new
 * URL("http://[::ffff:127.0.0.1]/").hostname` comes back as the compressed
 * hex form `::ffff:7f00:1`, which doesn't match any IPv4 dotted-decimal
 * pattern and previously slipped straight past every check below. Extract
 * the embedded IPv4 (hex-group or, defensively, dotted-decimal form) and
 * re-run the same IPv4 checks against it.
 */
function extractIPv4MappedAddress(h: string): string | null {
  const dotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dotted) return dotted[1];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

// Shared SSRF guard used by both metadata fetching (src/lib/data/
// metadata.ts) and link health checking (src/lib/data/link-check.ts) — one
// implementation, so the two never drift apart on what's safe to fetch.
// Blocks requests aimed at the machine itself or internal networks so
// neither feature can be used as an open SSRF proxy against localhost,
// cloud metadata endpoints (169.254.169.254), or RFC1918/loopback ranges.
export function isBlockedHost(hostname: string): boolean {
  // `new URL(...).hostname` keeps the surrounding brackets for an IPv6
  // literal (e.g. "[::1]", "[::ffff:7f00:1]") — strip them before matching.
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (isBlockedIPv4(h)) return true;
  const mapped = extractIPv4MappedAddress(h);
  if (mapped && isBlockedIPv4(mapped)) return true;
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
