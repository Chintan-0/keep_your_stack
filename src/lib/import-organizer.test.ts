import { describe, it, expect } from "vitest";
import { leafFolderName, suggestStackForFolder, suggestCategoryForFolder, groupByFolder } from "./import-organizer";
import type { Category, Stack } from "./types";
import type { ParsedBookmark } from "./bookmark-import";

const categories: Category[] = [
  { id: "development", name: "Development", parentId: null, sortOrder: 0 },
  { id: "dev-frontend", name: "Frontend", parentId: "development", sortOrder: 0 },
  { id: "design", name: "Design", parentId: null, sortOrder: 1 },
];

const stacks: Stack[] = [
  { id: "stack-1", name: "Frontend", description: "", icon: "🌐", color: "accent", visibility: "private", slug: null, createdAt: "" },
];

describe("leafFolderName", () => {
  it("returns the last specific segment", () => {
    expect(leafFolderName("Bookmarks bar / Development / Frontend")).toBe("Frontend");
  });

  it("skips generic root-only folders", () => {
    expect(leafFolderName("Bookmarks bar")).toBeNull();
    expect(leafFolderName("Other bookmarks")).toBeNull();
  });

  it("returns null for no folder", () => {
    expect(leafFolderName(null)).toBeNull();
  });
});

describe("suggestStackForFolder", () => {
  it("reuses an existing stack with a matching name, case-insensitively", () => {
    const result = suggestStackForFolder("Bookmarks bar / Development / Frontend", stacks);
    expect(result).toEqual({ existingStackId: "stack-1", suggestedName: null });
  });

  it("suggests creating a new stack when no existing one matches", () => {
    const result = suggestStackForFolder("Bookmarks bar / Design", stacks);
    expect(result).toEqual({ existingStackId: null, suggestedName: "Design" });
  });

  it("suggests nothing for a generic-only folder", () => {
    expect(suggestStackForFolder("Bookmarks bar", stacks)).toEqual({ existingStackId: null, suggestedName: null });
  });
});

describe("suggestCategoryForFolder", () => {
  it("matches the most specific folder segment against a real category name", () => {
    expect(suggestCategoryForFolder("Bookmarks bar / Development / Frontend", categories)).toBe("dev-frontend");
  });

  it("falls back to a less specific segment if the leaf doesn't match", () => {
    expect(suggestCategoryForFolder("Bookmarks bar / Development / Something Unknown", categories)).toBe(
      "development"
    );
  });

  it("never invents a category that doesn't exist", () => {
    expect(suggestCategoryForFolder("Bookmarks bar / Totally Unrelated", categories)).toBeNull();
  });

  it("returns null for no folder", () => {
    expect(suggestCategoryForFolder(null, categories)).toBeNull();
  });
});

describe("groupByFolder", () => {
  it("groups bookmarks by folder, preserving first-seen order", () => {
    const bookmarks: ParsedBookmark[] = [
      { title: "A", url: "https://a.com", folder: "Dev", addedAt: null },
      { title: "B", url: "https://b.com", folder: "Design", addedAt: null },
      { title: "C", url: "https://c.com", folder: "Dev", addedAt: null },
      { title: "D", url: "https://d.com", folder: null, addedAt: null },
    ];
    const groups = groupByFolder(bookmarks);
    expect(groups.map((g) => g.folder)).toEqual(["Dev", "Design", null]);
    expect(groups[0].bookmarks.map((b) => b.title)).toEqual(["A", "C"]);
    expect(groups[2].bookmarks.map((b) => b.title)).toEqual(["D"]);
  });
});
