import { describe, it, expect } from "vitest";
import { normalizeUrl, getDomain, categoryPath, categoryName } from "./utils";

describe("normalizeUrl", () => {
  it("adds https:// when no protocol is given", () => {
    expect(normalizeUrl("squoosh.app")).toBe("https://squoosh.app/");
  });

  it("lowercases nothing about the path but normalizes bare-domain trailing slash", () => {
    expect(normalizeUrl("https://squoosh.app")).toBe("https://squoosh.app/");
    expect(normalizeUrl("https://squoosh.app/")).toBe("https://squoosh.app/");
  });

  it("strips the hash fragment", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
  });

  it("treats the same URL with/without a trailing slash as identical (duplicate detection)", () => {
    expect(normalizeUrl("https://usebruno.com")).toBe(normalizeUrl("https://usebruno.com/"));
  });

  it("treats http and https as different (does not silently rewrite scheme)", () => {
    expect(normalizeUrl("http://example.com")).not.toBe(normalizeUrl("https://example.com"));
  });

  it("returns null for garbage input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("not a url at all !!")).toBeNull();
  });

  it("never produces a javascript: URL, even from unusual input", () => {
    const result = normalizeUrl("javascript:alert(1)");
    expect(result === null || result.startsWith("https://")).toBe(true);
  });
});

describe("getDomain", () => {
  it("strips the www prefix", () => {
    expect(getDomain("https://www.github.com/anthropics")).toBe("github.com");
  });

  it("keeps subdomains that aren't www", () => {
    expect(getDomain("https://docs.github.com")).toBe("docs.github.com");
  });

  it("falls back to the raw input when it isn't a valid URL", () => {
    expect(getDomain("not-a-url")).toBe("not-a-url");
  });
});

describe("category helpers", () => {
  it("builds a readable parent → child path for a real seeded category", () => {
    expect(categoryPath("dev-web-images")).toBe("Development → Image Tools");
  });

  it("returns just the name for a top-level category", () => {
    expect(categoryName("development")).toBe("Development");
  });

  it("falls back to Uncategorized for null or unknown ids", () => {
    expect(categoryPath(null)).toBe("Uncategorized");
    expect(categoryName("not-a-real-category")).toBe("Uncategorized");
  });
});
