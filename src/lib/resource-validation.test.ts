import { describe, it, expect } from "vitest";
import {
  clampTitle,
  clampDescription,
  clampNotes,
  clampUseCases,
  clampTagNames,
  sanitizePricing,
  sanitizePlatform,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_USE_CASE_LENGTH,
  MAX_USE_CASES_COUNT,
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_COUNT,
  MAX_PLATFORMS_COUNT,
} from "./resource-validation";

describe("resource field validation (server-side length limits — §9 of the Phase 12 audit)", () => {
  it("leaves an ordinary title untouched", () => {
    expect(clampTitle("React")).toBe("React");
  });

  it("truncates a pathologically long title rather than rejecting the whole save", () => {
    const huge = "x".repeat(MAX_TITLE_LENGTH + 1000);
    const result = clampTitle(huge);
    expect(result.length).toBe(MAX_TITLE_LENGTH);
  });

  it("truncates a pathologically long description", () => {
    const huge = "y".repeat(MAX_DESCRIPTION_LENGTH + 1000);
    expect(clampDescription(huge).length).toBe(MAX_DESCRIPTION_LENGTH);
  });

  it("truncates pathologically long notes", () => {
    const huge = "z".repeat(MAX_NOTES_LENGTH + 5000);
    expect(clampNotes(huge).length).toBe(MAX_NOTES_LENGTH);
  });

  it("caps both the count and the length of Useful For entries", () => {
    const tooMany = Array.from({ length: MAX_USE_CASES_COUNT + 10 }, (_, i) => `use case ${i}`);
    const result = clampUseCases(tooMany);
    expect(result.length).toBe(MAX_USE_CASES_COUNT);

    const tooLong = ["a".repeat(MAX_USE_CASE_LENGTH + 100)];
    expect(clampUseCases(tooLong)[0].length).toBe(MAX_USE_CASE_LENGTH);
  });

  it("caps both the count and the length of tag names", () => {
    const tooMany = Array.from({ length: MAX_TAGS_COUNT + 20 }, (_, i) => `tag${i}`);
    expect(clampTagNames(tooMany).length).toBe(MAX_TAGS_COUNT);

    const tooLong = ["b".repeat(MAX_TAG_NAME_LENGTH + 50)];
    expect(clampTagNames(tooLong)[0].length).toBe(MAX_TAG_NAME_LENGTH);
  });

  it("never throws on empty input", () => {
    expect(clampTitle("")).toBe("");
    expect(clampDescription("")).toBe("");
    expect(clampNotes("")).toBe("");
    expect(clampUseCases([])).toEqual([]);
    expect(clampTagNames([])).toEqual([]);
  });
});

describe("sanitizePricing (§9 — pricing is a closed enum only at the TS level, not at runtime)", () => {
  it("accepts each real pricing value", () => {
    expect(sanitizePricing("free")).toBe("free");
    expect(sanitizePricing("freemium")).toBe("freemium");
    expect(sanitizePricing("paid")).toBe("paid");
    expect(sanitizePricing("open-source")).toBe("open-source");
  });

  it("drops anything not in the enum instead of storing it", () => {
    expect(sanitizePricing("expensive")).toBeNull();
    expect(sanitizePricing("x".repeat(10000))).toBeNull();
  });

  it("drops non-string and absent input", () => {
    expect(sanitizePricing(null)).toBeNull();
    expect(sanitizePricing(undefined)).toBeNull();
    expect(sanitizePricing(42)).toBeNull();
    expect(sanitizePricing(["free"])).toBeNull();
  });
});

describe("sanitizePlatform (§9 — platform is a plain text[] column with no DB check constraint)", () => {
  it("keeps only recognized platform values", () => {
    expect(sanitizePlatform(["web", "cli"])).toEqual(["web", "cli"]);
  });

  it("drops unrecognized values rather than storing arbitrary strings", () => {
    expect(sanitizePlatform(["web", "<script>alert(1)</script>", "cli"])).toEqual(["web", "cli"]);
  });

  it("dedupes", () => {
    expect(sanitizePlatform(["web", "web", "cli"])).toEqual(["web", "cli"]);
  });

  it("caps the count so an unbounded array can't be written", () => {
    const valid = ["web", "desktop", "cli", "mobile", "vscode-extension", "browser-extension"];
    const huge = Array.from({ length: 500 }, (_, i) => valid[i % valid.length]);
    expect(sanitizePlatform(huge).length).toBeLessThanOrEqual(MAX_PLATFORMS_COUNT);
  });

  it("returns an empty array for non-array or absent input, never throws", () => {
    expect(sanitizePlatform(undefined)).toEqual([]);
    expect(sanitizePlatform(null)).toEqual([]);
    expect(sanitizePlatform("web")).toEqual([]);
  });
});
