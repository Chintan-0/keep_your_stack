import { describe, it, expect } from "vitest";
import {
  cleanDescription,
  normalizeTagName,
  dedupeTags,
  suggestTags,
  suggestUsefulFor,
  suggestCategoryForResource,
  canOverwriteDescription,
  canOverwriteUsefulFor,
  MAX_SUGGESTED_TAGS,
} from "./enrichment";
import type { Category } from "./types";

describe("cleanDescription", () => {
  it("returns empty for null/undefined/empty input — never invents content", () => {
    expect(cleanDescription(null)).toBe("");
    expect(cleanDescription(undefined)).toBe("");
    expect(cleanDescription("")).toBe("");
    expect(cleanDescription("   ")).toBe("");
  });

  it("strips stray HTML tags", () => {
    expect(cleanDescription("Compress <b>images</b> fast")).toBe("Compress images fast");
  });

  it("collapses excessive whitespace", () => {
    expect(cleanDescription("Compress   images\n\nfast")).toBe("Compress images fast");
  });

  it("preserves an already-good description essentially as-is", () => {
    const good = "Make images smaller using modern codecs, right in the browser.";
    expect(cleanDescription(good)).toBe(good);
  });

  it("strips an obvious trailing '| Site Name' suffix", () => {
    expect(cleanDescription("Compress and optimize your images for the web | Squoosh")).toBe(
      "Compress and optimize your images for the web"
    );
  });

  it("caps excessively long descriptions at a sentence/word boundary, never mid-word", () => {
    const long = "This is a sentence. ".repeat(20).trim();
    const result = cleanDescription(long);
    expect(result.length).toBeLessThanOrEqual(221); // cap + ellipsis allowance
    expect(result.endsWith(".") || result.endsWith("…")).toBe(true);
  });

  it("does not crash or throw on malformed HTML-ish input", () => {
    expect(() => cleanDescription("<div><span>broken<div unclosed")).not.toThrow();
  });
});

describe("normalizeTagName / dedupeTags", () => {
  it("lowercases and trims", () => {
    expect(normalizeTagName("  React  ")).toBe("react");
    expect(normalizeTagName("REACT")).toBe("react");
  });

  it("collapses known synonyms to one canonical slug", () => {
    expect(normalizeTagName("JS")).toBe("javascript");
    expect(normalizeTagName("Node.js")).toBe("node");
    expect(normalizeTagName("CI/CD")).toBe("ci-cd");
  });

  it("dedupeTags collapses case/synonym variants into one entry", () => {
    expect(dedupeTags(["React", "react", "REACT"])).toEqual(["react"]);
    expect(dedupeTags(["js", "JavaScript", "javascript"])).toEqual(["javascript"]);
  });

  it("dedupeTags drops empty entries", () => {
    expect(dedupeTags(["react", "", "  "])).toEqual(["react"]);
  });
});

describe("suggestTags", () => {
  it("finds meaningful, high-value tags from real evidence (Bruno-like API tool)", () => {
    const tags = suggestTags({ title: "Bruno", description: "A fast and git-friendly API client for testing GraphQL and REST APIs over HTTP" });
    expect(tags).toContain("api");
    expect(tags).toContain("graphql");
  });

  it("finds tags for an image-compression tool (Squoosh-like)", () => {
    const tags = suggestTags({ title: "Squoosh", description: "Compress and optimize images using WebP and other modern codecs" });
    expect(tags).toContain("images");
    expect(tags).toContain("compression");
  });

  it("finds React/animation/component tags (React Bits-like)", () => {
    const tags = suggestTags({ title: "React Bits", description: "Animated React UI components for building beautiful interfaces" });
    expect(tags).toContain("react");
    expect(tags).toContain("animation");
    expect(tags).toContain("components");
  });

  it("caps at MAX_SUGGESTED_TAGS even when many keywords match — no tag explosion", () => {
    const kitchenSink = [
      "react", "typescript", "graphql", "api", "http", "testing", "images", "compression",
      "svg", "icons", "fonts", "animation", "components", "design", "database", "auth",
      "docker", "monitoring", "markdown", "regex", "json",
    ].join(" ");
    const tags = suggestTags({ title: kitchenSink, description: kitchenSink });
    expect(tags.length).toBeLessThanOrEqual(MAX_SUGGESTED_TAGS);
  });

  it("returns no tags — not filler — when there's no real signal", () => {
    expect(suggestTags({ title: "Untitled Page", description: "" })).toEqual([]);
  });

  it("never generates a tag for every individual word in a long descriptive sentence", () => {
    const tags = suggestTags({
      title: "Modern open-source React animation component library for beautiful interfaces",
    });
    // Should stay a small, curated set (react/animation/components/open-source/ui at most),
    // not a match for "modern"/"beautiful"/"library"/"interfaces" etc.
    expect(tags.length).toBeLessThanOrEqual(MAX_SUGGESTED_TAGS);
    expect(tags).not.toContain("modern");
    expect(tags).not.toContain("beautiful");
    expect(tags).not.toContain("library");
  });
});

describe("suggestUsefulFor", () => {
  it("suggests a specific phrase from strong title+description evidence (image compression)", () => {
    const result = suggestUsefulFor({ title: "Squoosh", description: "Make images smaller using modern codecs" });
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("compress");
    expect(result!.confidence).toBe("high");
  });

  it("suggests a specific phrase for a GraphQL API client", () => {
    const result = suggestUsefulFor({ title: "Bruno", description: "Test and debug your GraphQL APIs offline" });
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("graphql");
  });

  it("suggests a specific phrase for SVG-to-React conversion", () => {
    const result = suggestUsefulFor({ title: "SVGR", description: "Convert SVG into React components" });
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("svg");
    expect(result!.value.toLowerCase()).toContain("react");
  });

  it("suggests QR code generation", () => {
    const result = suggestUsefulFor({ title: "QR Code Generator", description: "Generate a QR code from any link" });
    expect(result!.value).toBe("Generate QR codes");
  });

  it("never falls back to a vague catch-all phrase", () => {
    const vaguePhrases = ["useful website", "developer tool", "helpful resource", "good for development"];
    const result = suggestUsefulFor({ title: "Some Obscure Tool With No Real Signal At All", description: "" });
    if (result) {
      expect(vaguePhrases).not.toContain(result.value.toLowerCase());
    }
  });

  it("returns null — not a guess — when there's no usable evidence", () => {
    expect(suggestUsefulFor({ title: "", description: "" })).toBeNull();
    expect(suggestUsefulFor({ title: "xk9z Corp Homepage", description: "" })).toBeNull();
  });

  it("does not overreach beyond the evidence (weak/no match stays null rather than inventing an ambitious claim)", () => {
    // A page that just mentions "image" alone, with no compression/optimization
    // context, shouldn't produce a confident, specific Useful For claim.
    const result = suggestUsefulFor({ title: "My Photo Gallery", description: "A collection of vacation photos" });
    expect(result).toBeNull();
  });
});

describe("canOverwriteDescription / canOverwriteUsefulFor (user-edit protection)", () => {
  it("allows overwriting an empty description", () => {
    expect(canOverwriteDescription({ description: "", descriptionSource: null })).toBe(true);
  });

  it("allows overwriting a system-authored description (e.g. on retry)", () => {
    expect(canOverwriteDescription({ description: "Old system text", descriptionSource: "system" })).toBe(true);
  });

  it("never allows overwriting a user-authored description", () => {
    expect(canOverwriteDescription({ description: "My own words", descriptionSource: "user" })).toBe(false);
  });

  it("allows overwriting empty Useful For", () => {
    expect(canOverwriteUsefulFor({ useCases: [], usefulForSource: null })).toBe(true);
  });

  it("allows overwriting system-authored Useful For", () => {
    expect(canOverwriteUsefulFor({ useCases: ["Old suggestion"], usefulForSource: "system" })).toBe(true);
  });

  it("never allows overwriting user-authored Useful For, even a single manual entry", () => {
    expect(canOverwriteUsefulFor({ useCases: ["Use this when building landing pages"], usefulForSource: "user" })).toBe(false);
  });
});

describe("suggestCategoryForResource", () => {
  const categories: Category[] = [
    { id: "c-dev", name: "Development", parentId: null, sortOrder: 0 },
    { id: "c-frontend", name: "Frontend", parentId: "c-dev", sortOrder: 0 },
    { id: "c-design", name: "Design", parentId: null, sortOrder: 1 },
  ];

  it("prefers a folder-based match (high confidence)", () => {
    const result = suggestCategoryForResource(
      { folder: "Bookmarks bar / Development / Frontend", title: "", description: "" },
      categories
    );
    expect(result).toEqual({ categoryId: "c-frontend", confidence: "high" });
  });

  it("falls back to a text match against an existing category's own name (medium confidence)", () => {
    const result = suggestCategoryForResource(
      { title: "Figma", description: "A design and prototyping tool" },
      categories
    );
    expect(result?.categoryId).toBe("c-design");
    expect(result?.confidence).toBe("medium");
  });

  it("falls back to a domain hint only at low confidence, and only if that category already exists", () => {
    const result = suggestCategoryForResource({ domain: "figma.com", title: "", description: "" }, categories);
    expect(result).toEqual({ categoryId: "c-design", confidence: "low" });
  });

  it("never invents a category that doesn't already exist", () => {
    const result = suggestCategoryForResource(
      { title: "Kubernetes Observatory", description: "Cloud infrastructure observability", domain: "example.com" },
      categories
    );
    expect(result).toBeNull();
  });

  it("returns null when there is no folder, text, or domain signal at all", () => {
    expect(suggestCategoryForResource({}, categories)).toBeNull();
  });
});
