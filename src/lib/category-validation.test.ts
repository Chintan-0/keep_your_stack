import { describe, it, expect } from "vitest";
import { validateCategoryName, normalizeCategoryName, MAX_CATEGORY_NAME_LENGTH } from "./category-validation";

describe("normalizeCategoryName", () => {
  it("trims leading/trailing whitespace", () => {
    expect(normalizeCategoryName("  Development  ")).toBe("Development");
  });

  it("collapses internal repeated whitespace", () => {
    expect(normalizeCategoryName("AI   &    ML")).toBe("AI & ML");
  });
});

describe("validateCategoryName", () => {
  it("accepts a normal name", () => {
    const result = validateCategoryName("Frontend");
    expect(result).toEqual({ ok: true, name: "Frontend" });
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateCategoryName("")).toEqual({ ok: false, error: "Give it a name first." });
    expect(validateCategoryName("   ")).toEqual({ ok: false, error: "Give it a name first." });
  });

  it("rejects a name over the max length", () => {
    const tooLong = "x".repeat(MAX_CATEGORY_NAME_LENGTH + 1);
    const result = validateCategoryName(tooLong);
    expect(result.ok).toBe(false);
  });

  it("accepts a name exactly at the max length", () => {
    const exact = "x".repeat(MAX_CATEGORY_NAME_LENGTH);
    expect(validateCategoryName(exact)).toEqual({ ok: true, name: exact });
  });

  it("trims before validating, so whitespace padding doesn't count toward the limit", () => {
    const padded = `  ${"x".repeat(MAX_CATEGORY_NAME_LENGTH)}  `;
    expect(validateCategoryName(padded).ok).toBe(true);
  });
});
