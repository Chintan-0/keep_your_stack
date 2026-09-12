import { describe, it, expect } from "vitest";
import { validateBackup, BACKUP_FORMAT_VERSION, MAX_BACKUP_RESOURCES } from "./backup";

function validBackup(overrides: Record<string, unknown> = {}) {
  return {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    categories: [{ id: "cat-1", name: "Development", parentId: null }],
    stacks: [{ id: "stack-1", name: "Frontend", description: "", icon: "📦", color: "accent" }],
    tags: [{ id: "tag-1", name: "react" }],
    resources: [
      {
        id: "res-1",
        title: "React",
        url: "https://react.dev",
        description: "A UI library",
        useCases: ["Build interfaces"],
        notes: "My note",
        categoryId: "cat-1",
        tagIds: ["tag-1"],
        stackIds: ["stack-1"],
        isFavorite: true,
        isArchived: false,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
        importSource: null,
        importFolder: null,
        importSourceId: null,
      },
    ],
    ...overrides,
  };
}

describe("validateBackup", () => {
  it("accepts a well-formed backup", () => {
    const result = validateBackup(validBackup());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.resources).toHaveLength(1);
      expect(result.backup.resources[0].title).toBe("React");
      expect(result.warnings).toEqual([]);
    }
  });

  it("rejects a non-object", () => {
    expect(validateBackup("not an object").ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup([1, 2, 3]).ok).toBe(false);
  });

  it("rejects a missing version", () => {
    const backup = validBackup();
    delete (backup as Record<string, unknown>).version;
    const result = validateBackup(backup);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown/future version rather than guessing at its shape", () => {
    const result = validateBackup(validBackup({ version: 999 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("999");
  });

  it("rejects a backup with no resources array", () => {
    const backup = validBackup();
    delete (backup as Record<string, unknown>).resources;
    expect(validateBackup(backup).ok).toBe(false);
  });

  it("rejects a backup exceeding the per-import resource limit", () => {
    const resources = Array.from({ length: MAX_BACKUP_RESOURCES + 1 }, (_, i) => ({
      id: `r${i}`,
      title: "x",
      url: "https://example.com",
    }));
    const result = validateBackup(validBackup({ resources }));
    expect(result.ok).toBe(false);
  });

  it("drops a resource missing required fields rather than failing the whole backup", () => {
    const backup = validBackup({
      resources: [
        { id: "ok-1", title: "Good", url: "https://good.example.com" },
        { id: "bad-1" /* missing title/url */ },
        "not even an object",
      ],
    });
    const result = validateBackup(backup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.resources).toHaveLength(1);
      expect(result.backup.resources[0].id).toBe("ok-1");
      expect(result.warnings.some((w) => w.includes("skipped"))).toBe(true);
    }
  });

  it("never trusts a resource's category/tag/stack id that isn't present in this same file's own arrays", () => {
    const backup = validBackup({
      categories: [],
      tags: [],
      stacks: [],
      resources: [
        {
          id: "res-1",
          title: "React",
          url: "https://react.dev",
          categoryId: "some-other-users-category-uuid",
          tagIds: ["some-other-users-tag-uuid"],
          stackIds: ["some-other-users-stack-uuid"],
        },
      ],
    });
    const result = validateBackup(backup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const r = result.backup.resources[0];
      expect(r.categoryId).toBeNull();
      expect(r.tagIds).toEqual([]);
      expect(r.stackIds).toEqual([]);
    }
  });

  it("fails cleanly when every resource is malformed, instead of returning an empty-but-ok backup", () => {
    const result = validateBackup(validBackup({ resources: [{ id: "bad" }] }));
    expect(result.ok).toBe(false);
  });

  it("defaults missing optional fields rather than throwing", () => {
    const backup = validBackup({
      categories: [],
      tags: [],
      stacks: [],
      resources: [{ id: "res-1", title: "Minimal", url: "https://example.com" }],
    });
    const result = validateBackup(backup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const r = result.backup.resources[0];
      expect(r.description).toBe("");
      expect(r.useCases).toEqual([]);
      expect(r.notes).toBe("");
      expect(r.isFavorite).toBe(false);
      expect(r.isArchived).toBe(false);
    }
  });

  it("preserves the original resource id as importSourceId for provenance", () => {
    const result = validateBackup(validBackup());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.resources[0].importSourceId).toBe("res-1");
  });
});
