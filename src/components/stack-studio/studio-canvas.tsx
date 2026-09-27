"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sparkles,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { useNow } from "@/lib/use-now";
import {
  computeStudioLayout,
  NODE_WIDTH,
  NODE_HEIGHT,
  REGION_PADDING,
  REGION_HEADER_HEIGHT,
  type RegionLayout,
} from "@/lib/stack-studio-layout";
import { categoryColor, tagColor, SEMANTIC_COLOR_CLASSES } from "@/lib/colors";
import { tokenizeQuery } from "@/lib/search-highlight";
import { cn } from "@/lib/utils";
import { CanvasNode } from "./canvas-node";
import { RegionDensityField } from "./region-density-field";
import { AutoOrganizeModal } from "./auto-organize-modal";
import { StudioMobileList } from "./studio-mobile-list";
import { Button } from "@/components/ui/button";
import type { Resource } from "@/lib/types";

function track(eventType: string, metadata?: Record<string, unknown>) {
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, metadata }),
  }).catch(() => {});
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const CULL_MARGIN = 300;
const MOBILE_BREAKPOINT = 768;

type FilterValue = "all" | "uncategorized" | "favorites" | "recent" | `category:${string}` | `stack:${string}`;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Stack Studio 2.0's main visual workspace — a large pannable/zoomable
 * canvas of the user's entire library, categories as regions, resources as
 * nodes. See src/lib/stack-studio-layout.ts for the (deterministic,
 * non-persisted) positioning, and canvas-node.tsx for individual nodes.
 */
export function StudioCanvas({
  highlightRecent = false,
  onImport,
  reviewCount = 0,
  onOpenReviewBoard,
  loadingMore = false,
  loadedCount,
  totalCount,
}: {
  highlightRecent?: boolean;
  onImport: () => void;
  /** Unresolved low-confidence items from the most recent import this session (if any) — see stack-studio/page.tsx's "workspace" stage, kept as a secondary review board rather than removed (§40). */
  reviewCount?: number;
  onOpenReviewBoard?: () => void;
  /** The rest of the library is still paging in behind the scenes — see stack-studio/page.tsx. Shown as a small non-blocking pill, never a full-screen loader. */
  loadingMore?: boolean;
  loadedCount?: number;
  totalCount?: number;
}) {
  const resources = useStore((s) => s.resources);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);
  const updateResource = useStore((s) => s.updateResource);
  const bulkMoveResources = useStore((s) => s.bulkMoveResources);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const archiveResource = useStore((s) => s.archiveResource);
  const addCategory = useStore((s) => s.addCategory);
  const openEditResource = useUIStore((s) => s.openEditResource);

  const active = useMemo(() => resources.filter((r) => !r.isArchived), [resources]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [filterValue, setFilterValue] = useState<FilterValue>(highlightRecent ? "recent" : "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverRegion, setDragOverRegion] = useState<string | null>(null);

  const layout = useMemo(
    () => computeStudioLayout(categories, active.map((r) => ({ id: r.id, categoryId: r.categoryId }))),
    [categories, active]
  );

  const resourceById = useMemo(() => new Map(active.map((r) => [r.id, r])), [active]);
  // `layout.nodes` only changes when `layout` itself does — Array.from()'d
  // fresh here so a pan/zoom-only render (which doesn't touch `layout`)
  // reuses the same array instead of reallocating+iterating all n nodes
  // every single mousemove/wheel tick.
  const nodeList = useMemo(() => Array.from(layout.nodes.values()), [layout]);

  // Zoom-based level of detail (Phase 15.7 §6-8): below FAR_ZOOM_MAX a
  // region renders ONLY its header + density field — no per-resource DOM
  // at all, regardless of whether that region holds 5 resources or 15,000.
  // Between FAR_ZOOM_MAX and MEDIUM_ZOOM_MAX, only a small representative
  // sample per region renders (plus a "+N more" badge) rather than every
  // node. At MEDIUM_ZOOM_MAX and above, all viewport-visible nodes render
  // as before. This is a real performance fix as much as a visual one —
  // the earlier "block" tier still rendered one DOM node per resource,
  // which is the actual cost QA measured, not just a "wall of rectangles"
  // look.
  const FAR_ZOOM_MAX = 0.25;
  const MEDIUM_ZOOM_MAX = 0.6;
  const REPRESENTATIVE_SAMPLE_SIZE = 14;

  const representativeIdsByRegion = useMemo(() => {
    const byRegion = new Map<string, string[]>();
    for (const node of nodeList) {
      const list = byRegion.get(node.regionKey);
      if (list) {
        if (list.length < REPRESENTATIVE_SAMPLE_SIZE) list.push(node.resourceId);
      } else {
        byRegion.set(node.regionKey, [node.resourceId]);
      }
    }
    return new Map(Array.from(byRegion.entries()).map(([key, ids]) => [key, new Set(ids)]));
  }, [nodeList]);

  // ── Filter / search / highlight ─────────────────────────────────────
  const now = useNow();
  const isVisibleByFilter = useCallback(
    (r: Resource): boolean => {
      if (filterValue === "all") return true;
      if (filterValue === "uncategorized") return !r.categoryId;
      if (filterValue === "favorites") return r.isFavorite;
      if (filterValue === "recent") return (now - new Date(r.createdAt).getTime()) / 86400000 <= 14;
      if (filterValue.startsWith("category:")) return r.categoryId === filterValue.slice(9);
      if (filterValue.startsWith("stack:")) return r.stackIds.includes(filterValue.slice(6));
      return true;
    },
    [filterValue, now]
  );

  // One pass over `active` (not one pass PER REGION) to get each region's
  // visible-under-the-current-filter count. Doing this inline inside the
  // regions.map() JSX (as an earlier version did) is O(regions × resource
  // count) on EVERY render — including every pan/zoom tick, since panning
  // re-renders this component — which measurably compounded as the library
  // grew during QA (multi-second stalls appeared well before 10k
  // resources). This is O(n) once per relevant change instead.
  const visibleCountByRegion = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of active) {
      if (!isVisibleByFilter(r)) continue;
      const key = r.categoryId ?? "uncategorized";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [active, isVisibleByFilter]);

  const searchTokens = useMemo(() => tokenizeQuery(searchQuery), [searchQuery]);
  const tagNameById = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const highlightActive = searchTokens.length > 0 || !!selectedTagId;
  const isHighlighted = useCallback(
    (r: Resource): boolean => {
      if (searchTokens.length > 0) {
        const haystack = `${r.title} ${r.domain} ${r.description} ${r.tagIds.map((id) => tagNameById.get(id) ?? "").join(" ")}`.toLowerCase();
        return searchTokens.every((t) => haystack.includes(t));
      }
      if (selectedTagId) return r.tagIds.includes(selectedTagId);
      return false;
    },
    [searchTokens, selectedTagId, tagNameById]
  );

  // Mobile's own list memoizes its category grouping by resources
  // reference — an inline .filter() at the call site would build a new
  // array every render and silently defeat that memoization.
  const mobileVisibleResources = useMemo(
    () => active.filter((r) => isVisibleByFilter(r) && (searchTokens.length === 0 || isHighlighted(r))),
    [active, isVisibleByFilter, searchTokens, isHighlighted]
  );

  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of active) for (const t of r.tagIds) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => tags.find((t) => t.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  }, [active, tags]);

  // ── Pan / zoom ───────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const didInitialFit = useRef(false);
  // Set the moment the user does ANYTHING to the view themselves — once
  // that happens, the background auto-refit below backs off permanently
  // rather than yanking their view away mid-organize.
  const userAdjustedView = useRef(false);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  // Mirrors the latest pan/zoom into refs so event handlers registered
  // once (wheel, mousemove/touchmove during a drag) can read current
  // values without re-subscribing on every change — assigned after render
  // commits, never during render itself.
  useEffect(() => {
    panRef.current = pan;
    zoomRef.current = zoom;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Seed synchronously from a real measurement rather than waiting for
    // the observer's first callback — QA found that callback can land
    // with a stale/zero contentRect around a rapid mount/unmount (e.g. the
    // mobile<->desktop breakpoint crossing unmounts and remounts this
    // whole container), and since ResizeObserver only fires again on an
    // ACTUAL subsequent size change, a bad first reading left
    // containerSize permanently stuck at 0x0 — breaking Fit/Reset for the
    // rest of the session with nothing to recover it.
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setContainerSize({ width: rect.width, height: rect.height });
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitToScreen = useCallback(
    (animate = false) => {
      if (containerSize.width === 0 || containerSize.height === 0) return;
      const margin = 0.9;
      const scale = clamp(
        Math.min((containerSize.width * margin) / layout.contentWidth, (containerSize.height * margin) / layout.contentHeight),
        MIN_ZOOM,
        1
      );
      const nextPan = {
        x: (containerSize.width - layout.contentWidth * scale) / 2,
        y: (containerSize.height - layout.contentHeight * scale) / 2,
      };
      setZoom(scale);
      setPan(nextPan);
      void animate; // CSS transition on the content div handles the animated feel
    },
    [containerSize, layout.contentWidth, layout.contentHeight]
  );

  useEffect(() => {
    if (didInitialFit.current) return;
    if (containerSize.width === 0) return;
    if (layout.regions.length === 0) return;
    didInitialFit.current = true;
    // One-time sync with an external system (the container's real measured
    // size, only known post-mount via ResizeObserver) — not derivable
    // during render, and guarded by didInitialFit so it can never cascade
    // beyond this single first fit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fitToScreen();
  }, [containerSize, layout.regions.length, fitToScreen]);

  // The initial fit above runs on whatever tiny first page happened to be
  // loaded when the container was first measured — with a large library
  // that's a small fraction of the eventual content, so it locks in a
  // zoomed-in view that never widens as thousands more resources page in
  // behind it (confirmed live: ended up at 100% zoom into one corner of a
  // ~17k-resource map). Re-fit exactly once more when the background load
  // finishes, unless the user already touched pan/zoom themselves by then.
  const didAutoFitAfterLoad = useRef(false);
  const prevLoadingMore = useRef(loadingMore);
  useEffect(() => {
    const justFinished = prevLoadingMore.current && !loadingMore;
    prevLoadingMore.current = loadingMore;
    if (!justFinished || didAutoFitAfterLoad.current || userAdjustedView.current) return;
    didAutoFitAfterLoad.current = true;
    fitToScreen();
  }, [loadingMore, fitToScreen, layout.contentWidth, layout.contentHeight]);

  function zoomAtPoint(nextZoomRaw: number, screenX: number, screenY: number) {
    userAdjustedView.current = true;
    const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
    const currentPan = panRef.current;
    const currentZoom = zoomRef.current;
    const worldX = (screenX - currentPan.x) / currentZoom;
    const worldY = (screenY - currentPan.y) / currentZoom;
    setZoom(nextZoom);
    setPan({ x: screenX - worldX * nextZoom, y: screenY - worldY * nextZoom });
  }

  // Wheel: native listener with {passive:false} — React's synthetic onWheel
  // is passive by default, which silently ignores preventDefault() and
  // lets the whole page scroll along with the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomAtPoint(zoomRef.current * factor, sx, sy);
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Click-drag to pan (background only — nodes/regions stop propagation via draggable semantics).
  const panningRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  function onBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    panningRef.current = { startX: e.clientX, startY: e.clientY, startPan: panRef.current };
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const p = panningRef.current;
      if (!p) return;
      userAdjustedView.current = true;
      setPan({ x: p.startPan.x + (e.clientX - p.startX), y: p.startPan.y + (e.clientY - p.startY) });
    }
    function onUp() {
      panningRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Touch: one finger pans, two fingers pinch-zoom.
  const touchRef = useRef<{ mode: "pan" | "pinch"; startX: number; startY: number; startPan: { x: number; y: number }; startDist: number; startZoom: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchRef.current = { mode: "pan", startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPan: panRef.current, startDist: 0, startZoom: zoomRef.current };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchRef.current = { mode: "pinch", startX: 0, startY: 0, startPan: panRef.current, startDist: dist, startZoom: zoomRef.current };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = touchRef.current;
    if (!t) return;
    userAdjustedView.current = true;
    if (t.mode === "pan" && e.touches.length === 1) {
      setPan({ x: t.startPan.x + (e.touches[0].clientX - t.startX), y: t.startPan.y + (e.touches[0].clientY - t.startY) });
    } else if (t.mode === "pinch" && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const nextZoom = clamp(t.startZoom * (dist / t.startDist), MIN_ZOOM, MAX_ZOOM);
      setZoom(nextZoom);
    }
  }
  function onTouchEnd() {
    touchRef.current = null;
  }

  function zoomButton(direction: 1 | -1) {
    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;
    zoomAtPoint(zoomRef.current * (direction > 0 ? 1.25 : 0.8), cx, cy);
  }

  function resetView() {
    userAdjustedView.current = true;
    setZoom(1);
    setPan({ x: 40, y: 40 });
  }

  // ── Viewport culling ─────────────────────────────────────────────────
  const worldRect = useMemo(
    () => ({
      left: -pan.x / zoom - CULL_MARGIN,
      top: -pan.y / zoom - CULL_MARGIN,
      right: (containerSize.width - pan.x) / zoom + CULL_MARGIN,
      bottom: (containerSize.height - pan.y) / zoom + CULL_MARGIN,
    }),
    [pan, zoom, containerSize]
  );

  // ── Actions ──────────────────────────────────────────────────────────
  async function moveResourceToCategory(resourceId: string, categoryId: string | null) {
    const resource = resourceById.get(resourceId);
    if (!resource || resource.categoryId === categoryId) return;
    try {
      await updateResource(resourceId, { categoryId });
      track("studio_resource_moved");
    } catch {
      // store already toasted the error and rolled back
    }
  }

  function handleDropOnRegion(e: React.DragEvent, region: RegionLayout) {
    e.preventDefault();
    setDragOverRegion(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    void moveResourceToCategory(id, region.categoryId);
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      await addCategory({ name, parentId: null });
      toast.success(`Created "${name}"`);
      setNewCategoryName("");
      track("studio_category_created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create that category.");
    } finally {
      setCreatingCategory(false);
    }
  }

  const uncategorizedResources = useMemo(() => active.filter((r) => !r.categoryId), [active]);

  function handleSetFilter(v: FilterValue) {
    setFilterValue(v);
    if (v !== "all") track("studio_filter_used");
  }

  // Debounced — fires once per pause in typing, not once per keystroke.
  // Also the "zoom toward the matching cluster" behavior (§28): at real
  // library scale (tens of thousands of resources spread across a huge
  // canvas), a match is very often outside the current viewport and gets
  // viewport-CULLED — i.e. not rendered at all, so dim/highlight alone
  // gives the user no signal a match exists. Confirmed live during QA:
  // searching a real, present title returned 0 visibly-highlighted nodes
  // simply because the match was off-screen. Re-centering the view on the
  // matching cluster is what makes search actually useful past a screenful
  // of resources, not just a nice-to-have.
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = setTimeout(() => {
      track("studio_search_used");
      const matchTokens = tokenizeQuery(searchQuery);
      if (matchTokens.length === 0 || containerSize.width === 0) return;
      const positions: { x: number; y: number }[] = [];
      for (const r of active) {
        const haystack = `${r.title} ${r.domain} ${r.description} ${r.tagIds.map((id) => tagNameById.get(id) ?? "").join(" ")}`.toLowerCase();
        if (!matchTokens.every((t) => haystack.includes(t))) continue;
        const node = layout.nodes.get(r.id);
        if (node) positions.push(node);
      }
      if (positions.length === 0) return;
      const minX = Math.min(...positions.map((p) => p.x));
      const minY = Math.min(...positions.map((p) => p.y));
      const maxX = Math.max(...positions.map((p) => p.x)) + NODE_WIDTH;
      const maxY = Math.max(...positions.map((p) => p.y)) + NODE_HEIGHT;
      const bboxWidth = Math.max(maxX - minX, NODE_WIDTH * 2);
      const bboxHeight = Math.max(maxY - minY, NODE_HEIGHT * 2);
      const margin = 0.8;
      const scale = clamp(
        Math.min((containerSize.width * margin) / bboxWidth, (containerSize.height * margin) / bboxHeight),
        MIN_ZOOM,
        1.5
      );
      setZoom(scale);
      setPan({
        x: containerSize.width / 2 - (minX + bboxWidth / 2) * scale,
        y: containerSize.height / 2 - (minY + bboxHeight / 2) * scale,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery, active, layout.nodes, tagNameById, containerSize]);

  useEffect(() => {
    track("stack_studio_map_viewed", { resourceCount: active.length });
    // Fires once per mount — this answers "did the canvas render", not
    // "did the page open" (stack_studio_opened already covers that at the
    // page level).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isMobile) {
    return (
      <div className="flex flex-col gap-4">
        <StudioToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterValue={filterValue}
          setFilterValue={handleSetFilter}
          onImport={onImport}
          onAutoOrganize={() => setAutoOrganizeOpen(true)}
          loadingMore={loadingMore}
          loadedCount={loadedCount}
          totalCount={totalCount}
          compact
        />
        <StudioMobileList
          resources={mobileVisibleResources}
          categories={categories}
          onMoveCategory={(id, categoryId) => void moveResourceToCategory(id, categoryId)}
          onOpenEdit={openEditResource}
        />
        <AutoOrganizeModal
          open={autoOrganizeOpen}
          onClose={() => setAutoOrganizeOpen(false)}
          uncategorized={uncategorizedResources}
          categories={categories}
          onApply={async (categoryId, ids) => {
            await bulkMoveResources(ids, categoryId);
            track("studio_auto_organize_completed", { count: ids.length });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[480px] flex-col gap-3">
      <StudioToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterValue={filterValue}
        setFilterValue={handleSetFilter}
        onImport={onImport}
        onAutoOrganize={() => {
          track("studio_auto_organize_started", { count: uncategorizedResources.length });
          setAutoOrganizeOpen(true);
        }}
        popularTags={popularTags}
        selectedTagId={selectedTagId}
        setSelectedTagId={setSelectedTagId}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        onCreateCategory={handleCreateCategory}
        creatingCategory={creatingCategory}
        reviewCount={reviewCount}
        onOpenReviewBoard={onOpenReviewBoard}
        loadingMore={loadingMore}
        loadedCount={loadedCount}
        totalCount={totalCount}
      />

      <div className="relative flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {/* Extremely subtle dot grid — a knowledge map, not a starfield. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border-strong) 1px, transparent 1px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <div
          ref={containerRef}
          onMouseDown={onBackgroundMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: layout.contentWidth,
              height: layout.contentHeight,
              position: "relative",
            }}
          >
            {layout.regions.map((region) => {
              const visibleCount = visibleCountByRegion.get(region.key) ?? 0;
              if (filterValue !== "all" && visibleCount === 0) return null;
              const accent = SEMANTIC_COLOR_CLASSES[categoryColor(region.categoryId ? region.name : null)];
              const isActiveFilterRegion =
                (region.categoryId && filterValue === `category:${region.categoryId}`) ||
                (!region.categoryId && filterValue === "uncategorized");
              return (
                <div
                  key={region.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverRegion(region.key);
                  }}
                  onDrop={(e) => handleDropOnRegion(e, region)}
                  className={cn(
                    "absolute rounded-[var(--radius-lg)] border transition-colors duration-150",
                    region.categoryId ? "border-border/60" : "border-dashed border-border-strong/70",
                    dragOverRegion === region.key ? "border-accent bg-accent-soft/40" : region.categoryId ? accent.soft : "bg-surface-2/40"
                  )}
                  style={{ left: region.x, top: region.y, width: region.width, height: region.height, opacity: region.categoryId ? 0.9 : 1 }}
                >
                  {zoom < FAR_ZOOM_MAX && region.count > 0 && (
                    <RegionDensityField
                      width={region.width - REGION_PADDING * 2}
                      height={region.height - REGION_HEADER_HEIGHT - REGION_PADDING}
                      left={REGION_PADDING}
                      top={REGION_HEADER_HEIGHT}
                      count={region.count}
                      seedKey={region.key}
                      colorVar={region.categoryId ? `--${categoryColor(region.name)}` : "--warning"}
                      dense={!region.categoryId}
                    />
                  )}
                  <button
                    onClick={() =>
                      handleSetFilter(isActiveFilterRegion ? "all" : region.categoryId ? `category:${region.categoryId}` : "uncategorized")
                    }
                    className={cn(
                      "absolute left-3 top-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold shadow-sm cursor-pointer",
                      isActiveFilterRegion ? "bg-accent text-white" : "bg-surface-2 text-text-primary hover:bg-surface-3"
                    )}
                    style={{ transform: `scale(${clamp(1 / zoom, 0.7, 1.6)})`, transformOrigin: "top left" }}
                  >
                    <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
                    {region.name}
                    <span className="font-mono text-[10px] opacity-70">{region.count}</span>
                  </button>
                  {zoom >= FAR_ZOOM_MAX && zoom < MEDIUM_ZOOM_MAX && region.count > REPRESENTATIVE_SAMPLE_SIZE && (
                    <span
                      className="absolute bottom-2 right-2.5 rounded-full bg-surface-2/90 px-2 py-0.5 font-mono text-[10px] text-text-muted shadow-sm"
                      style={{ transform: `scale(${clamp(1 / zoom, 0.7, 1.6)})`, transformOrigin: "bottom right" }}
                    >
                      +{(region.count - REPRESENTATIVE_SAMPLE_SIZE).toLocaleString()} more
                    </span>
                  )}
                </div>
              );
            })}

            {zoom >= FAR_ZOOM_MAX &&
              nodeList.map((node) => {
                if (
                  node.x + NODE_WIDTH < worldRect.left ||
                  node.x > worldRect.right ||
                  node.y + NODE_HEIGHT < worldRect.top ||
                  node.y > worldRect.bottom
                ) {
                  return null;
                }
                // Medium zoom only renders each region's representative
                // sample (see representativeIdsByRegion) — the "+N more"
                // badge on the region itself covers the rest, matching
                // Phase 15.7 §11.
                if (zoom < MEDIUM_ZOOM_MAX && !representativeIdsByRegion.get(node.regionKey)?.has(node.resourceId)) {
                  return null;
                }
              const resource = resourceById.get(node.resourceId);
              if (!resource) return null;
              if (filterValue !== "all" && !isVisibleByFilter(resource)) return null;
              return (
                <CanvasNode
                  key={resource.id}
                  resource={resource}
                  categories={categories}
                  tags={tags}
                  zoom={zoom}
                  x={node.x}
                  y={node.y}
                  dimmed={highlightActive ? !isHighlighted(resource) : draggingId === resource.id}
                  highlighted={highlightActive && isHighlighted(resource)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", resource.id);
                    setDraggingId(resource.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverRegion(null);
                  }}
                  onOpenEdit={() => openEditResource(resource.id)}
                  onMoveCategory={(categoryId) => void moveResourceToCategory(resource.id, categoryId)}
                  onToggleFavorite={() => toggleFavorite(resource.id)}
                  onArchive={() => {
                    archiveResource(resource.id);
                    toast.success("Archived");
                  }}
                />
              );
            })}
          </div>
        </div>

        {active.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-[15px] font-medium text-text-primary">Your toolbox is waiting.</p>
            <p className="max-w-xs text-[12.5px] text-text-secondary">
              Add a resource or import your bookmarks to start filling in the map.
            </p>
            <Button size="sm" onClick={onImport}>
              <UploadCloud size={13} /> Import Bookmarks
            </Button>
          </div>
        )}

        {/* View controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-[var(--radius-md)] border border-border-strong bg-surface-2 p-1 shadow-lg">
          <button onClick={() => zoomButton(-1)} aria-label="Zoom out" className="rounded p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text-primary cursor-pointer">
            <ZoomOut size={14} />
          </button>
          <span className="w-11 text-center font-mono text-[11px] text-text-muted">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomButton(1)} aria-label="Zoom in" className="rounded p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text-primary cursor-pointer">
            <ZoomIn size={14} />
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          <button onClick={() => { userAdjustedView.current = true; fitToScreen(); }} aria-label="Fit to screen" className="rounded p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text-primary cursor-pointer">
            <Maximize2 size={14} />
          </button>
          <button onClick={resetView} aria-label="Reset view" className="rounded p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text-primary cursor-pointer">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <AutoOrganizeModal
        open={autoOrganizeOpen}
        onClose={() => setAutoOrganizeOpen(false)}
        uncategorized={uncategorizedResources}
        categories={categories}
        onApply={async (categoryId, ids) => {
          await bulkMoveResources(ids, categoryId);
          track("studio_auto_organize_completed", { count: ids.length });
        }}
      />
    </div>
  );
}

function StudioToolbar({
  searchQuery,
  setSearchQuery,
  filterValue,
  setFilterValue,
  onImport,
  onAutoOrganize,
  popularTags = [],
  selectedTagId = null,
  setSelectedTagId,
  newCategoryName,
  setNewCategoryName,
  onCreateCategory,
  creatingCategory,
  reviewCount = 0,
  onOpenReviewBoard,
  loadingMore = false,
  loadedCount,
  totalCount,
  compact = false,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterValue: FilterValue;
  setFilterValue: (v: FilterValue) => void;
  onImport: () => void;
  onAutoOrganize: () => void;
  popularTags?: { id: string; name: string }[];
  selectedTagId?: string | null;
  setSelectedTagId?: (id: string | null) => void;
  newCategoryName?: string;
  setNewCategoryName?: (v: string) => void;
  onCreateCategory?: (e: React.FormEvent) => void;
  creatingCategory?: boolean;
  loadingMore?: boolean;
  loadedCount?: number;
  totalCount?: number;
  reviewCount?: number;
  onOpenReviewBoard?: () => void;
  compact?: boolean;
}) {
  const chips: { value: FilterValue; label: string }[] = [
    { value: "all", label: "All" },
    { value: "uncategorized", label: "Uncategorized" },
    { value: "favorites", label: "Favorites" },
    { value: "recent", label: "Recent" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search this map…"
            className="h-8 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 pl-7 pr-2 text-[12.5px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        {loadingMore && (
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] text-text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Loading your library… {loadedCount?.toLocaleString()}
            {totalCount ? ` / ${totalCount.toLocaleString()}` : ""}
          </span>
        )}
        {chips.map((c) => (
          <button
            key={c.value}
            onClick={() => setFilterValue(filterValue === c.value ? "all" : c.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors cursor-pointer",
              filterValue === c.value ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:border-border-strong"
            )}
          >
            {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {reviewCount > 0 && onOpenReviewBoard && (
            <button
              onClick={onOpenReviewBoard}
              className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[12px] font-medium text-warning cursor-pointer"
            >
              Needs review · {reviewCount}
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={onImport}>
            <UploadCloud size={13} /> Import
          </Button>
          <Button variant="secondary" size="sm" onClick={onAutoOrganize}>
            <Sparkles size={13} /> Auto-organize
          </Button>
        </div>
      </div>

      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          {popularTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {popularTags.map((t) => {
                const palette = SEMANTIC_COLOR_CLASSES[tagColor(t.name)];
                const active = selectedTagId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTagId?.(active ? null : t.id)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] transition-colors cursor-pointer",
                      active ? "border-accent" : "border-transparent",
                      palette.soft,
                      palette.text
                    )}
                  >
                    <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", palette.dot)} />
                    {t.name}
                  </button>
                );
              })}
              {selectedTagId && (
                <button onClick={() => setSelectedTagId?.(null)} className="text-text-muted hover:text-text-primary cursor-pointer">
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          {onCreateCategory && (
            <form onSubmit={onCreateCategory} className="ml-auto flex items-center gap-1.5">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName?.(e.target.value)}
                placeholder="New category…"
                className="h-7 w-32 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 text-[11.5px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={creatingCategory || !newCategoryName?.trim()}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
              >
                <Plus size={11} /> Create
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
