import { describe, it, expect } from "vitest";
import { resolveDefaultCategoryId } from "./demo-data";
import type { Category } from "./types";

describe("resolveDefaultCategoryId", () => {
  it("resolves a top-level slug to the matching user category by name", () => {
    const userCategories: Category[] = [
      { id: "u1", name: "Development", parentId: null, sortOrder: 0 },
    ];
    expect(resolveDefaultCategoryId("development", userCategories)).toBe("u1");
  });

  it("resolves a subcategory slug only when its parent's name also matches", () => {
    const userCategories: Category[] = [
      { id: "u1", name: "Development", parentId: null, sortOrder: 0 },
      { id: "u2", name: "Frontend", parentId: "u1", sortOrder: 0 },
    ];
    expect(resolveDefaultCategoryId("dev-frontend", userCategories)).toBe("u2");
  });

  it("does not match a same-named category under the wrong parent", () => {
    const userCategories: Category[] = [
      { id: "u1", name: "Design", parentId: null, sortOrder: 0 },
      // "Frontend" exists, but under Design instead of Development.
      { id: "u2", name: "Frontend", parentId: "u1", sortOrder: 0 },
    ];
    expect(resolveDefaultCategoryId("dev-frontend", userCategories)).toBeNull();
  });

  it("returns null once the user has renamed/deleted the default category — never resurrects it", () => {
    const userCategories: Category[] = [{ id: "u1", name: "Engineering", parentId: null, sortOrder: 0 }];
    expect(resolveDefaultCategoryId("development", userCategories)).toBeNull();
  });

  it("returns null for a slug that was never part of the default taxonomy", () => {
    expect(resolveDefaultCategoryId("not-a-real-slug", [])).toBeNull();
  });

  it("matches case-insensitively", () => {
    const userCategories: Category[] = [{ id: "u1", name: "development", parentId: null, sortOrder: 0 }];
    expect(resolveDefaultCategoryId("development", userCategories)).toBe("u1");
  });
});
