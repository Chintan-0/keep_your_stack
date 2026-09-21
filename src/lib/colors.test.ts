import { describe, it, expect } from "vitest";
import { categoryColor, tagColor, SEMANTIC_COLOR_CLASSES } from "./colors";

describe("categoryColor", () => {
  it("maps known category keywords to their intended semantic color", () => {
    expect(categoryColor("Development")).toBe("blue");
    expect(categoryColor("Frontend Development")).toBe("blue");
    expect(categoryColor("Design")).toBe("coral");
    expect(categoryColor("Database")).toBe("cyan");
    expect(categoryColor("AI & ML")).toBe("violet");
    expect(categoryColor("Productivity")).toBe("warning");
    expect(categoryColor("Security")).toBe("danger");
    expect(categoryColor("Reference")).toBe("success");
  });

  it("is case-insensitive", () => {
    expect(categoryColor("SECURITY")).toBe("danger");
    expect(categoryColor("security")).toBe("danger");
  });

  it("is deterministic for an unrecognized category name (same input, same output, every call)", () => {
    const first = categoryColor("Some Made-Up Category");
    for (let i = 0; i < 20; i++) {
      expect(categoryColor("Some Made-Up Category")).toBe(first);
    }
  });

  it("falls back to a real color (never undefined/throws) for null/empty input", () => {
    expect(SEMANTIC_COLOR_CLASSES[categoryColor(null)]).toBeDefined();
    expect(SEMANTIC_COLOR_CLASSES[categoryColor(undefined)]).toBeDefined();
    expect(SEMANTIC_COLOR_CLASSES[categoryColor("")]).toBeDefined();
  });
});

describe("tagColor", () => {
  it("is deterministic — the same tag name always renders the same color", () => {
    const names = ["react", "graphql", "images", "cli-tool", "open-source"];
    for (const name of names) {
      const first = tagColor(name);
      for (let i = 0; i < 10; i++) {
        expect(tagColor(name)).toBe(first);
      }
    }
  });

  it("is case-insensitive, so the same tag typed differently still matches", () => {
    expect(tagColor("React")).toBe(tagColor("react"));
    expect(tagColor("GraphQL")).toBe(tagColor("graphql"));
  });

  it("returns a color present in the shared semantic palette", () => {
    const color = tagColor("some-tag");
    expect(SEMANTIC_COLOR_CLASSES[color]).toBeDefined();
  });
});
