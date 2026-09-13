import { describe, it, expect } from "vitest";
import { isBlockedHost } from "./url-guard";

describe("isBlockedHost (§10/§11 SSRF audit — guards metadata fetch and link-check)", () => {
  it("blocks localhost and its subdomains", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("LOCALHOST")).toBe(true);
    expect(isBlockedHost("foo.localhost")).toBe(true);
  });

  it("blocks loopback, unspecified, and private IPv4 ranges", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("0.0.0.0")).toBe(true);
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("169.254.169.254")).toBe(true); // cloud metadata
  });

  it("does not block a real public IPv4 address", () => {
    expect(isBlockedHost("172.32.0.1")).toBe(false); // just outside 172.16.0.0/12
    expect(isBlockedHost("93.184.216.34")).toBe(false);
  });

  it("blocks disguised-IPv4 forms the URL parser already canonicalizes to dotted-decimal", () => {
    // `new URL(...).hostname` normalizes these before isBlockedHost ever
    // sees them, so passing the canonical form here is the honest
    // simulation of what the guard actually receives.
    expect(isBlockedHost(new URL("http://2130706433/").hostname)).toBe(true); // decimal 127.0.0.1
    expect(isBlockedHost(new URL("http://0x7f000001/").hostname)).toBe(true); // hex 127.0.0.1
    expect(isBlockedHost(new URL("http://127.1/").hostname)).toBe(true); // short-form 127.0.0.1
  });

  it("blocks IPv6 loopback and link-local/unique-local ranges", () => {
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("fe80::1")).toBe(true);
    expect(isBlockedHost("fc00::1")).toBe(true);
    expect(isBlockedHost("fd12:3456::1")).toBe(true);
  });

  it("blocks the same IPv6 ranges when passed bracketed, as `new URL(...).hostname` actually produces for any IPv6 literal — a second bypass found alongside the IPv4-mapped one", () => {
    expect(isBlockedHost(new URL("http://[::1]/").hostname)).toBe(true);
    expect(isBlockedHost(new URL("http://[fe80::1]/").hostname)).toBe(true);
    expect(isBlockedHost(new URL("http://[fc00::1]/").hostname)).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses wrapping a private/loopback/metadata IPv4 — the bypass found during the Phase 12 SSRF audit", () => {
    // `new URL("http://[::ffff:127.0.0.1]/").hostname` comes back as the
    // compressed hex form, not dotted-decimal — this used to slip straight
    // through every check.
    expect(isBlockedHost(new URL("http://[::ffff:127.0.0.1]/").hostname)).toBe(true);
    expect(isBlockedHost(new URL("http://[::ffff:169.254.169.254]/").hostname)).toBe(true);
    expect(isBlockedHost(new URL("http://[::ffff:10.0.0.5]/").hostname)).toBe(true);
    expect(isBlockedHost(new URL("http://[::ffff:192.168.1.1]/").hostname)).toBe(true);
    // dotted-decimal mapped form, in case some caller passes it unparsed
    expect(isBlockedHost("::ffff:127.0.0.1")).toBe(true);
  });

  it("does not block an IPv4-mapped IPv6 address wrapping a real public IPv4", () => {
    expect(isBlockedHost(new URL("http://[::ffff:93.184.216.34]/").hostname)).toBe(false);
  });

  it("does not block an ordinary public hostname", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("github.com")).toBe(false);
  });
});
