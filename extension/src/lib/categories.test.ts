import { describe, it, expect } from "vitest";
import { buildCategoryOptions } from "./categories";

describe("buildCategoryOptions", () => {
  it("lists top-level categories with a plain label", () => {
    const options = buildCategoryOptions([
      { id: "dev", name: "Development", parentId: null },
      { id: "design", name: "Design", parentId: null },
    ]);
    expect(options.map((o) => o.label)).toEqual(["Design", "Development"]);
  });

  it("nests a subcategory right after its parent with an arrow label", () => {
    const options = buildCategoryOptions([
      { id: "dev", name: "Development", parentId: null },
      { id: "dev-fe", name: "Frontend", parentId: "dev" },
    ]);
    expect(options.map((o) => o.label)).toEqual(["Development", "Development → Frontend"]);
  });

  it("sorts subcategories under each parent alphabetically", () => {
    const options = buildCategoryOptions([
      { id: "dev", name: "Development", parentId: null },
      { id: "dev-fe", name: "Frontend", parentId: "dev" },
      { id: "dev-be", name: "Backend", parentId: "dev" },
    ]);
    expect(options.map((o) => o.label)).toEqual([
      "Development",
      "Development → Backend",
      "Development → Frontend",
    ]);
  });

  it("returns an empty list for no categories", () => {
    expect(buildCategoryOptions([])).toEqual([]);
  });

  it("ignores a subcategory whose parent isn't in the list rather than crashing", () => {
    const options = buildCategoryOptions([{ id: "orphan", name: "Orphan", parentId: "missing-parent" }]);
    expect(options).toEqual([]);
  });
});
