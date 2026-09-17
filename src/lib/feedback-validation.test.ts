import { describe, it, expect } from "vitest";
import { isFeedbackCategory } from "./feedback-validation";

describe("isFeedbackCategory", () => {
  it("accepts every real category", () => {
    for (const c of ["bug", "idea", "confusing", "other"]) {
      expect(isFeedbackCategory(c)).toBe(true);
    }
  });

  it("rejects an arbitrary or malformed value", () => {
    expect(isFeedbackCategory("feature-request")).toBe(false);
    expect(isFeedbackCategory("")).toBe(false);
    expect(isFeedbackCategory(null)).toBe(false);
    expect(isFeedbackCategory(undefined)).toBe(false);
    expect(isFeedbackCategory(42)).toBe(false);
    expect(isFeedbackCategory({ category: "bug" })).toBe(false);
  });
});
