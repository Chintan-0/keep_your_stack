import { describe, it, expect } from "vitest";
import { suggestOrganization, reviewBucket } from "./stack-studio";
import type { Category, Stack } from "./types";

const categories: Category[] = [
  { id: "cat-frontend", name: "Frontend", parentId: null, sortOrder: 0 },
  { id: "cat-design", name: "Design", parentId: null, sortOrder: 1 },
];
const stacks: Stack[] = [
  { id: "stack-frontend", name: "Frontend", description: "", icon: "🌐", color: "accent", visibility: "private", slug: null, createdAt: "" },
];

describe("suggestOrganization", () => {
  it("gives HIGH confidence with an honest reason when the bookmark folder matches an existing category exactly", () => {
    const result = suggestOrganization(
      { title: "React", description: "A UI library", domain: "react.dev", folder: "Development / Frontend" },
      categories,
      stacks
    );
    expect(result.categoryId).toBe("cat-frontend");
    expect(result.confidence).toBe("high");
    expect(result.reasons.some((r) => r.includes("Development / Frontend"))).toBe(true);
  });

  it("matches an existing stack by folder leaf name", () => {
    const result = suggestOrganization(
      { title: "React", description: "", domain: "react.dev", folder: "Bookmarks bar / Frontend" },
      categories,
      stacks
    );
    expect(result.stackId).toBe("stack-frontend");
  });

  it("suggests a new stack name when no existing stack matches the folder", () => {
    const result = suggestOrganization(
      { title: "Something", description: "", domain: "example.com", folder: "Bookmarks bar / Design Tools" },
      categories,
      stacks
    );
    expect(result.stackId).toBeNull();
    expect(result.newStackName).toBe("Design Tools");
  });

  it("has no confident category for an unrecognized resource with no folder — goes to review", () => {
    const result = suggestOrganization({ title: "Random Site", description: "", domain: "example.com", folder: null }, categories, stacks);
    expect(result.categoryId).toBeNull();
    expect(result.confidence).toBe("none");
    expect(reviewBucket(result.confidence)).toBe("review");
  });

  it("reviewBucket only trusts HIGH confidence as confident", () => {
    expect(reviewBucket("high")).toBe("confident");
    expect(reviewBucket("medium")).toBe("review");
    expect(reviewBucket("low")).toBe("review");
    expect(reviewBucket("none")).toBe("review");
  });
});
