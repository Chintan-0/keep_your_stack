import { describe, it, expect } from "vitest";
import { findPossibleDuplicates, type DuplicateCandidateInput } from "./duplicates";

function r(id: string, title: string, domain: string): DuplicateCandidateInput {
  return { id, title, domain, createdAt: new Date().toISOString() };
}

describe("findPossibleDuplicates", () => {
  it("groups two resources with the same domain and near-identical titles", () => {
    const groups = findPossibleDuplicates([
      r("1", "Squoosh", "squoosh.app"),
      r("2", "Squoosh - Image Compressor", "squoosh.app"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(["1", "2"]);
  });

  it("does not group resources on different domains even with identical titles", () => {
    // Same tool name, different vendor — not a duplicate, a coincidence.
    const groups = findPossibleDuplicates([r("1", "Docs", "react.dev"), r("2", "Docs", "vuejs.org")]);
    expect(groups).toHaveLength(0);
  });

  it("does not group merely similar/alternative tools on the same domain", () => {
    // Contrived same-domain case with unrelated titles — must not merge.
    const groups = findPossibleDuplicates([
      r("1", "Bruno API Client", "example.com"),
      r("2", "Company Careers Page", "example.com"),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("does not classify Bruno and Postman as duplicates — similar tools, not the same resource", () => {
    const groups = findPossibleDuplicates([
      r("1", "Bruno", "usebruno.com"),
      r("2", "Postman", "postman.com"),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("groups three near-identical resources into one group, not pairwise duplicates", () => {
    const groups = findPossibleDuplicates([
      r("1", "Squoosh", "squoosh.app"),
      r("2", "Squoosh App", "squoosh.app"),
      r("3", "Squoosh Image Tool", "squoosh.app"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(["1", "2", "3"]);
  });

  it("leaves unrelated resources completely out of any group", () => {
    const groups = findPossibleDuplicates([
      r("1", "Squoosh", "squoosh.app"),
      r("2", "Squoosh Clone", "squoosh.app"),
      r("3", "React", "react.dev"),
    ]);
    const groupedIds = groups.flatMap((g) => g.ids);
    expect(groupedIds).not.toContain("3");
  });

  it("returns an empty array for an empty or single-resource library", () => {
    expect(findPossibleDuplicates([])).toEqual([]);
    expect(findPossibleDuplicates([r("1", "Squoosh", "squoosh.app")])).toEqual([]);
  });

  it("reports a confidence between 0 and 1", () => {
    const groups = findPossibleDuplicates([r("1", "Squoosh", "squoosh.app"), r("2", "Squoosh App", "squoosh.app")]);
    expect(groups[0].confidence).toBeGreaterThan(0);
    expect(groups[0].confidence).toBeLessThanOrEqual(1);
  });
});
