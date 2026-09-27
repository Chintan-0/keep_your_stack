// Deterministic spatial layout for the Stack Studio canvas (Stack Studio
// 2.0). Given the same categories/resources, this always produces the same
// regions and node positions — no randomness, no physics simulation, no
// persisted x/y to keep in sync. That satisfies the "don't jump around
// between loads" requirement with far less risk than a force-directed
// layout or a freeform-position persistence system would carry, at the
// cost of the user not being able to drag a resource to an arbitrary point
// within its region (dragging still works — it changes *category*, which
// re-triggers this same deterministic packing).

export interface LayoutCategory {
  id: string;
  name: string;
}

export interface LayoutResource {
  id: string;
  categoryId: string | null;
}

export interface RegionLayout {
  key: string; // categoryId, or "uncategorized"
  categoryId: string | null;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
}

export interface NodeLayout {
  resourceId: string;
  regionKey: string;
  x: number;
  y: number;
}

export interface StudioLayout {
  regions: RegionLayout[];
  nodes: Map<string, NodeLayout>;
  contentWidth: number;
  contentHeight: number;
}

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 96;
const NODE_GAP = 14;
const REGION_PADDING = 20;
const REGION_HEADER_HEIGHT = 44;
const REGION_GAP = 32;
const MAX_ROW_WIDTH = 1760;
const UNCATEGORIZED_KEY = "uncategorized";

function packGridSize(count: number): { columns: number; rows: number } {
  if (count <= 0) return { columns: 1, rows: 0 };
  // Aim for a roughly 3:2 (wide) grid rather than a perfect square — most
  // canvases/monitors are wider than they are tall, so regions read better
  // slightly wide.
  //
  // IMPORTANT: no fixed upper cap on columns here. An earlier version
  // capped this at 8, which looks fine for a normal-sized category but is
  // a real bug for a very large one (e.g. "Uncategorized" holding most of
  // a freshly-imported library): with count=15,449 that produced an 8-wide,
  // ~1,932-row region — 1,704 x 234,110 world px, i.e. a hairline sliver
  // that made fit-to-screen useless and effectively hid every other
  // category off the bottom of the map. Scaling columns with sqrt(count)
  // (uncapped) keeps every region roughly square-ish regardless of size —
  // see stack-studio-layout.test.ts's aspect-ratio assertion.
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.5)));
  const rows = Math.ceil(count / columns);
  return { columns, rows };
}

function regionSize(count: number): { width: number; height: number } {
  const { columns, rows } = packGridSize(count);
  const contentWidth = columns * NODE_WIDTH + (columns - 1) * NODE_GAP;
  const contentHeight = rows * NODE_HEIGHT + (rows - 1) * NODE_GAP;
  return {
    width: contentWidth + REGION_PADDING * 2,
    height: contentHeight + REGION_PADDING * 2 + REGION_HEADER_HEIGHT,
  };
}

/**
 * Groups resources by category (including a dedicated "uncategorized"
 * bucket), then packs categories into rows like text wrapping — larger
 * categories get proportionally more space, capped so one huge category
 * can't consume the whole canvas width. Uncategorized is always placed
 * last, on its own row, so it reads as a distinct "territory" rather than
 * blending in with organized categories.
 */
export function computeStudioLayout(categories: LayoutCategory[], resources: LayoutResource[]): StudioLayout {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const buckets = new Map<string, { name: string; categoryId: string | null; ids: string[] }>();

  for (const r of resources) {
    const cat = r.categoryId ? categoryById.get(r.categoryId) : null;
    const key = cat ? cat.id : UNCATEGORIZED_KEY;
    if (!buckets.has(key)) {
      buckets.set(key, { name: cat ? cat.name : "Uncategorized", categoryId: cat ? cat.id : null, ids: [] });
    }
    buckets.get(key)!.ids.push(r.id);
  }

  // Also include empty categories that exist but currently hold nothing —
  // they still deserve a (small) visible territory, per §6/§18 ("the new
  // category appears as a new region" the moment it's created, before
  // anything's been moved into it).
  for (const c of categories) {
    if (!buckets.has(c.id)) buckets.set(c.id, { name: c.name, categoryId: c.id, ids: [] });
  }

  const organized = Array.from(buckets.entries())
    .filter(([key]) => key !== UNCATEGORIZED_KEY)
    .sort((a, b) => b[1].ids.length - a[1].ids.length || a[1].name.localeCompare(b[1].name));
  const uncategorized = buckets.get(UNCATEGORIZED_KEY);

  const regions: RegionLayout[] = [];
  const nodes = new Map<string, NodeLayout>();

  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;
  let maxX = 0;

  function placeRegion(key: string, name: string, categoryId: string | null, ids: string[], forceNewRow: boolean) {
    const { width, height } = regionSize(ids.length);
    if (forceNewRow && shelfX > 0) {
      shelfY += shelfHeight + REGION_GAP;
      shelfX = 0;
      shelfHeight = 0;
    } else if (shelfX > 0 && shelfX + width > MAX_ROW_WIDTH) {
      shelfY += shelfHeight + REGION_GAP;
      shelfX = 0;
      shelfHeight = 0;
    }

    const x = shelfX;
    const y = shelfY;
    regions.push({ key, categoryId, name, x, y, width, height, count: ids.length });

    const { columns } = packGridSize(ids.length);
    ids.forEach((id, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      nodes.set(id, {
        resourceId: id,
        regionKey: key,
        x: x + REGION_PADDING + col * (NODE_WIDTH + NODE_GAP),
        y: y + REGION_HEADER_HEIGHT + REGION_PADDING + row * (NODE_HEIGHT + NODE_GAP),
      });
    });

    shelfX += width + REGION_GAP;
    shelfHeight = Math.max(shelfHeight, height);
    maxX = Math.max(maxX, x + width);
  }

  for (const [key, bucket] of organized) {
    placeRegion(key, bucket.name, bucket.categoryId, bucket.ids, false);
  }

  if (uncategorized && uncategorized.ids.length > 0) {
    placeRegion(UNCATEGORIZED_KEY, "Uncategorized", null, uncategorized.ids, true);
  }

  const contentHeight = shelfY + shelfHeight;
  return { regions, nodes, contentWidth: Math.max(maxX, 1), contentHeight: Math.max(contentHeight, 1) };
}
