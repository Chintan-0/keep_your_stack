import { describe, it, expect } from "vitest";
import { normalizeUrl as extNormalize, getDomain as extGetDomain, isSupportedUrl } from "./url";
import { normalizeUrl as appNormalize, getDomain as appGetDomain } from "../../../src/lib/utils";

// This is the test that actually enforces "the extension and web app use
// the same URL normalization behavior" (Phase 5 spec §7/§30) — not just a
// comment saying so. If either copy drifts, this fails.
describe("extension normalizeUrl matches the web app's normalizeUrl", () => {
  const samples = [
    "https://nextjs.org",
    "https://nextjs.org/",
    "https://nextjs.org/docs",
    "https://nextjs.org/docs/",
    "https://nextjs.org/docs?query=1",
    "https://nextjs.org/docs#section",
    "http://example.com",
    "www.example.com",
    "example.com",
    "  https://Example.com  ",
    "not a url",
    "",
  ];

  for (const sample of samples) {
    it(`agrees on ${JSON.stringify(sample)}`, () => {
      expect(extNormalize(sample)).toBe(appNormalize(sample));
    });
  }

  it("agrees on getDomain for a normalized URL", () => {
    const normalized = appNormalize("https://www.usebruno.com/downloads")!;
    expect(extGetDomain(normalized)).toBe(appGetDomain(normalized));
  });
});

describe("normalizeUrl (extension copy)", () => {
  it("treats a bare domain and its trailing-slash form as the same resource", () => {
    expect(extNormalize("https://nextjs.org")).toBe(extNormalize("https://nextjs.org/"));
  });

  it("does not collapse a meaningful path's trailing slash away from its non-trailing form incorrectly", () => {
    // Only the bare "/" root path is stripped — a real path keeps its shape.
    expect(extNormalize("https://nextjs.org/docs/")).not.toBe(extNormalize("https://nextjs.org/docs"));
  });

  it("preserves query parameters", () => {
    expect(extNormalize("https://example.com/search?q=react")).toContain("q=react");
  });

  it("returns null for unparsable input", () => {
    expect(extNormalize("not a url")).toBeNull();
    expect(extNormalize("")).toBeNull();
  });
});

describe("isSupportedUrl", () => {
  it("accepts http/https pages", () => {
    expect(isSupportedUrl("https://react.dev")).toBe(true);
    expect(isSupportedUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects browser-internal and unusual schemes", () => {
    expect(isSupportedUrl("chrome://extensions")).toBe(false);
    expect(isSupportedUrl("chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html")).toBe(false);
    expect(isSupportedUrl("edge://settings")).toBe(false);
    expect(isSupportedUrl("about:blank")).toBe(false);
    expect(isSupportedUrl("file:///Users/me/notes.txt")).toBe(false);
    expect(isSupportedUrl("view-source:https://example.com")).toBe(false);
  });

  it("rejects malformed URLs without throwing", () => {
    expect(isSupportedUrl("not a url")).toBe(false);
  });

  it("rejects dangerous schemes a malicious link or context-menu target could carry", () => {
    expect(isSupportedUrl("javascript:alert(1)")).toBe(false);
    expect(isSupportedUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSupportedUrl("vbscript:msgbox(1)")).toBe(false);
  });
});
