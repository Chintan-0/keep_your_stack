import { describe, it, expect } from "vitest";
import { buildMatchLabels, type MatchFlags } from "./search-match-labels";

const NONE: MatchFlags = {
  matched_title: false,
  matched_title_prefix: false,
  matched_use_cases: false,
  matched_tags: false,
  matched_category: false,
  matched_stacks: false,
  matched_description: false,
  matched_notes: false,
  matched_domain: false,
  matched_folder: false,
};

describe("buildMatchLabels", () => {
  it("returns nothing when nothing matched — never fabricates a reason", () => {
    expect(buildMatchLabels(NONE)).toEqual([]);
  });

  it("labels a title match", () => {
    expect(buildMatchLabels({ ...NONE, matched_title: true })).toEqual(["Title"]);
  });

  it("labels a title-prefix match the same as Title (still an honest title-based reason)", () => {
    expect(buildMatchLabels({ ...NONE, matched_title_prefix: true })).toEqual(["Title"]);
  });

  it("does not duplicate Title when both title flags are set", () => {
    expect(buildMatchLabels({ ...NONE, matched_title: true, matched_title_prefix: true })).toEqual(["Title"]);
  });

  it("orders labels by weight tier — Title/Useful For before Category/Stack before Note/Domain/Folder", () => {
    const labels = buildMatchLabels({
      ...NONE,
      matched_notes: true,
      matched_category: true,
      matched_use_cases: true,
      matched_domain: true,
    });
    expect(labels).toEqual(["Useful For", "Category", "Note", "Domain"]);
  });

  it("includes every field that matched, only those", () => {
    const labels = buildMatchLabels({ ...NONE, matched_tags: true, matched_folder: true });
    expect(labels).toEqual(["Tag", "Imported folder"]);
  });
});
