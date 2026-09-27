import { describe, it, expect } from "vitest";
import { computeStudioLayout } from "./stack-studio-layout";

const categories = [
  { id: "dev", name: "Development" },
  { id: "design", name: "Design" },
];

describe("computeStudioLayout", () => {
  it("is deterministic — same input always produces the same output", () => {
    const resources = [
      { id: "1", categoryId: "dev" },
      { id: "2", categoryId: "dev" },
      { id: "3", categoryId: "design" },
      { id: "4", categoryId: null },
    ];
    const a = computeStudioLayout(categories, resources);
    const b = computeStudioLayout(categories, resources);
    expect(JSON.stringify(a.regions)).toBe(JSON.stringify(b.regions));
    expect(JSON.stringify(Array.from(a.nodes.entries()))).toBe(JSON.stringify(Array.from(b.nodes.entries())));
  });

  it("creates a region for every category with resources, plus uncategorized when present", () => {
    const resources = [
      { id: "1", categoryId: "dev" },
      { id: "2", categoryId: null },
    ];
    const layout = computeStudioLayout(categories, resources);
    const keys = layout.regions.map((r) => r.key);
    expect(keys).toContain("dev");
    expect(keys).toContain("uncategorized");
    // design has zero resources but still exists as a category — it still
    // gets a (small) territory per §6/§18.
    expect(keys).toContain("design");
  });

  it("omits the uncategorized region entirely when there are no uncategorized resources", () => {
    const resources = [{ id: "1", categoryId: "dev" }];
    const layout = computeStudioLayout(categories, resources);
    expect(layout.regions.some((r) => r.key === "uncategorized")).toBe(false);
  });

  it("gives every resource a node position inside its own region's bounds", () => {
    const resources = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, categoryId: "dev" }));
    const layout = computeStudioLayout(categories, resources);
    const region = layout.regions.find((r) => r.key === "dev")!;
    for (const r of resources) {
      const node = layout.nodes.get(r.id)!;
      expect(node).toBeDefined();
      expect(node.x).toBeGreaterThanOrEqual(region.x);
      expect(node.x).toBeLessThan(region.x + region.width);
      expect(node.y).toBeGreaterThanOrEqual(region.y);
      expect(node.y).toBeLessThan(region.y + region.height);
    }
  });

  it("gives larger categories proportionally more area than smaller ones", () => {
    const resources = [
      ...Array.from({ length: 40 }, (_, i) => ({ id: `big${i}`, categoryId: "dev" })),
      { id: "small1", categoryId: "design" },
    ];
    const layout = computeStudioLayout(categories, resources);
    const big = layout.regions.find((r) => r.key === "dev")!;
    const small = layout.regions.find((r) => r.key === "design")!;
    expect(big.width * big.height).toBeGreaterThan(small.width * small.height);
  });

  it("handles zero resources without throwing", () => {
    const layout = computeStudioLayout(categories, []);
    expect(layout.nodes.size).toBe(0);
  });

  it("keeps a very large region's aspect ratio bounded (never a hairline sliver)", () => {
    // Regression: a hard 8-column cap used to make a 15k-resource region
    // ~1,704 x 234,110 world px — a vertical sliver that broke
    // fit-to-screen and hid every other category below it.
    const resources = Array.from({ length: 15449 }, (_, i) => ({ id: `u${i}`, categoryId: null }));
    const layout = computeStudioLayout(categories, resources);
    const region = layout.regions.find((r) => r.key === "uncategorized")!;
    const ratio = region.width / region.height;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(5);
  });
});
