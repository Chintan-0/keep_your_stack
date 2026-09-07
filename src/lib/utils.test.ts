import { describe, it, expect } from "vitest";
import { normalizeUrl, getDomain, categoryPath, categoryName, topLevelCategories, childCategories, needsReview } from "./utils";
import type { Category } from "./types";

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

// Categories are dynamic/per-user now — these helpers take the caller's
// own category list rather than a fixed taxonomy (src/lib/data/categories.ts
// is where creation/rename/move/delete actually happen; this just covers
// the pure lookup/formatting logic against an arbitrary hierarchy).
const categories: Category[] = [
  { id: "development", name: "Development", parentId: null, sortOrder: 0 },
  { id: "dev-images", name: "Image Tools", parentId: "development", sortOrder: 1 },
  { id: "dev-frontend", name: "Frontend", parentId: "development", sortOrder: 0 },
  { id: "design", name: "Design", parentId: null, sortOrder: 1 },
];

describe("category helpers", () => {
  it("builds a readable parent → child path for a subcategory", () => {
    expect(categoryPath("dev-images", categories)).toBe("Development → Image Tools");
  });

  it("returns just the name for a top-level category", () => {
    expect(categoryName("development", categories)).toBe("Development");
  });

  it("falls back to Uncategorized for null or unknown ids", () => {
    expect(categoryPath(null, categories)).toBe("Uncategorized");
    expect(categoryName("not-a-real-category", categories)).toBe("Uncategorized");
  });

  it("topLevelCategories returns only parentId:null rows, sorted", () => {
    expect(topLevelCategories(categories).map((c) => c.id)).toEqual(["development", "design"]);
  });

  it("childCategories returns a parent's own children, sorted by sortOrder", () => {
    expect(childCategories(categories, "development").map((c) => c.id)).toEqual(["dev-frontend", "dev-images"]);
  });

  it("childCategories returns an empty array for a category with none", () => {
    expect(childCategories(categories, "design")).toEqual([]);
  });
});

describe("needsReview", () => {
  it("is true for a resource with no category and no useful-for", () => {
    expect(needsReview({ categoryId: null, useCases: [] })).toBe(true);
  });

  it("is false once it has a category", () => {
    expect(needsReview({ categoryId: "development", useCases: [] })).toBe(false);
  });

  it("is false once it has at least one useful-for entry", () => {
    expect(needsReview({ categoryId: null, useCases: ["Test APIs"] })).toBe(false);
  });
});
