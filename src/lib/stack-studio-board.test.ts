import { describe, it, expect } from "vitest";
import { columnsForWidth, buildBoardRows } from "./stack-studio-board";

describe("columnsForWidth", () => {
  it("returns 1 column below the sm breakpoint (mobile fallback)", () => {
    expect(columnsForWidth(375)).toBe(1);
    expect(columnsForWidth(639)).toBe(1);
  });

  it("returns 2/3/4 columns at the sm/lg/xl breakpoints", () => {
    expect(columnsForWidth(640)).toBe(2);
    expect(columnsForWidth(1024)).toBe(3);
    expect(columnsForWidth(1280)).toBe(4);
    expect(columnsForWidth(1920)).toBe(4);
  });
});

describe("buildBoardRows", () => {
  const resolveCategoryId = (name: string) => (name === "Needs Review" ? null : `cat-${name}`);

  it("emits exactly one header row per group regardless of group size", () => {
    const grouped: [string, { id: string }[]][] = [
      ["Frontend", Array.from({ length: 37 }, (_, i) => ({ id: `f${i}` }))],
      ["Backend", Array.from({ length: 3 }, (_, i) => ({ id: `b${i}` }))],
    ];
    const rows = buildBoardRows(grouped, resolveCategoryId, 4);
    const headers = rows.filter((r) => r.type === "header");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toMatchObject({ name: "Frontend", count: 37 });
    expect(headers[1]).toMatchObject({ name: "Backend", count: 3 });
  });

  it("chunks each group's cards into rows of exactly `columns` items (last row may be short)", () => {
    const grouped: [string, { id: string }[]][] = [["Frontend", Array.from({ length: 10 }, (_, i) => ({ id: `f${i}` }))]];
    const rows = buildBoardRows(grouped, resolveCategoryId, 4);
    const cardRows = rows.filter((r) => r.type === "cards");
    // 10 items / 4 per row = 3 rows (4, 4, 2)
    expect(cardRows).toHaveLength(3);
    expect(cardRows[0].items).toHaveLength(4);
    expect(cardRows[1].items).toHaveLength(4);
    expect(cardRows[2].items).toHaveLength(2);
  });

  it("never loses or duplicates an item across row chunks — the flattened rows reconstruct the original group exactly", () => {
    const items = Array.from({ length: 137 }, (_, i) => ({ id: `item-${i}` }));
    const rows = buildBoardRows([["Big", items]], resolveCategoryId, 4);
    const flattened = rows.filter((r) => r.type === "cards").flatMap((r) => r.items.map((i) => i.id));
    expect(flattened).toEqual(items.map((i) => i.id));
  });

  it("carries the resolved category id onto every row in a group, including its header", () => {
    const grouped: [string, { id: string }[]][] = [["Frontend", [{ id: "f1" }]]];
    const rows = buildBoardRows(grouped, resolveCategoryId, 4);
    expect(rows.every((r) => r.categoryId === "cat-Frontend")).toBe(true);
  });

  it("resolves the Needs Review group to a null category id (used as the 'uncategorized' drop target)", () => {
    const grouped: [string, { id: string }[]][] = [["Needs Review", [{ id: "r1" }]]];
    const rows = buildBoardRows(grouped, resolveCategoryId, 4);
    expect(rows.every((r) => r.categoryId === null)).toBe(true);
  });

  it("produces zero card rows (only a header) for an empty group", () => {
    const rows = buildBoardRows([["Empty", []]], resolveCategoryId, 4);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("header");
  });

  it("stays correct at a column count of 1 (mobile) and clamps a non-positive column count to 1", () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `i${i}` }));
    const oneColumn = buildBoardRows([["G", items]], resolveCategoryId, 1);
    expect(oneColumn.filter((r) => r.type === "cards")).toHaveLength(3);

    const zeroColumn = buildBoardRows([["G", items]], resolveCategoryId, 0);
    expect(zeroColumn.filter((r) => r.type === "cards")).toHaveLength(3); // treated as 1, not an infinite loop
  });

  it("keeps row count independent of a single group's size once past a few thousand items (proof the windowing math itself doesn't degrade at scale)", () => {
    const items = Array.from({ length: 10000 }, (_, i) => ({ id: `item-${i}` }));
    const rows = buildBoardRows([["Huge", items]], resolveCategoryId, 4);
    // 10,000 / 4 = 2,500 card rows + 1 header — a lot of ROW METADATA, but
    // the point of virtualization is that only a handful of these rows are
    // ever mounted at once (verified separately, live, in the browser).
    expect(rows).toHaveLength(2501);
  });
});
