// Pure helpers behind Stack Studio's virtualized workspace board — kept
// separate from the page component specifically so the windowing logic
// (how many resources land in one row, how groups flatten into a single
// list a virtualizer can window) has direct unit test coverage instead of
// only being exercised indirectly through a full page render.

/** Matches the grid's own Tailwind breakpoints (sm/lg/xl) so the virtualizer's row layout lines up with the CSS grid it's windowing. */
const COLUMN_BREAKPOINTS: [minWidth: number, columns: number][] = [
  [1280, 4],
  [1024, 3],
  [640, 2],
];

export function columnsForWidth(width: number): number {
  for (const [minWidth, columns] of COLUMN_BREAKPOINTS) {
    if (width >= minWidth) return columns;
  }
  return 1;
}

export type BoardRow<Item> =
  | { type: "header"; key: string; name: string; count: number; categoryId: string | null }
  | { type: "cards"; key: string; items: Item[]; categoryId: string | null };

/**
 * Flattens "N groups of M cards" into "rows" — one header row per group,
 * then one row per `columns` cards — so a single window virtualizer can
 * cap rendered DOM nodes to roughly what fits the viewport regardless of
 * whether there are 100 or 10,000 imported resources. Every row still
 * carries the category id it belongs to, so a virtualized drop target
 * doesn't need one wrapper spanning the whole group (which would defeat
 * the point — that wrapper would itself hold every card in the group).
 */
export function buildBoardRows<Item extends { id: string }>(
  grouped: [name: string, items: Item[]][],
  resolveCategoryId: (groupName: string) => string | null,
  columns: number
): BoardRow<Item>[] {
  const rows: BoardRow<Item>[] = [];
  const safeColumns = Math.max(1, columns);
  for (const [name, group] of grouped) {
    const categoryId = resolveCategoryId(name);
    rows.push({ type: "header", key: `h:${name}`, name, count: group.length, categoryId });
    for (let i = 0; i < group.length; i += safeColumns) {
      rows.push({ type: "cards", key: `${name}:${i}`, items: group.slice(i, i + safeColumns), categoryId });
    }
  }
  return rows;
}
