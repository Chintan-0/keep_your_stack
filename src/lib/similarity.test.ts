import { describe, it, expect } from "vitest";
import { similarDocs } from "./similarity";

const docs = [
  { id: "a", text: "React component library for frontend interfaces" },
  { id: "b", text: "Next.js framework for React frontend apps" },
  { id: "c", text: "Figma design prototype for interface mockups" },
  { id: "d", text: "Postgres database server for relational data" },
];

describe("similarDocs", () => {
  it("ranks the most related resource first", () => {
    const result = similarDocs(docs, "a");
    expect(result[0].id).toBe("b");
  });

  it("does not include the target itself", () => {
    expect(similarDocs(docs, "a").some((m) => m.id === "a")).toBe(false);
  });

  it("drops unrelated resources below the minimum score", () => {
    const ids = similarDocs(docs, "a").map((m) => m.id);
    expect(ids).not.toContain("d");
  });

  it("returns nothing for an unknown id or empty text", () => {
    expect(similarDocs(docs, "missing")).toEqual([]);
    expect(similarDocs([{ id: "x", text: "the and" }, ...docs], "x")).toEqual([]);
  });

  it("scores are between 0 and 1", () => {
    for (const m of similarDocs(docs, "a")) {
      expect(m.score).toBeGreaterThan(0);
      expect(m.score).toBeLessThanOrEqual(1);
    }
  });
});
