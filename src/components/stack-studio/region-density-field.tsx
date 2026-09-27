"use client";

import { useEffect, useRef } from "react";

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) || 1;
}

// Deterministic PRNG (mulberry32) — the same region always draws the same
// dot pattern. A real Math.random() field would visibly reshuffle itself
// on every re-render (pan, zoom, an unrelated resource moving elsewhere),
// which reads as flickering noise rather than a stable "this is a lot of
// stuff" impression.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The far-zoom "this category has a lot of resources" visualization
 * (Phase 15.7 §6–9) — a single <canvas>, not one DOM node per resource.
 * Rendering thousands of individual rectangles at 15% zoom was both
 * visually meaningless (an undifferentiated wall of color) and the actual
 * performance cost QA found — a canvas costs the same to draw whether it
 * represents 5 resources or 15,000.
 */
export function RegionDensityField({
  width,
  height,
  left,
  top,
  count,
  seedKey,
  colorVar,
  dense = false,
}: {
  width: number;
  height: number;
  /** Position within the region's own (already-positioned) wrapper. */
  left: number;
  top: number;
  count: number;
  seedKey: string;
  /** A CSS custom property name, e.g. "--blue" — resolved to its actual color at draw time since Canvas2D can't take a var() reference directly. */
  colorVar: string;
  dense?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The canvas's CSS display size (`width`/`height` below) is the
    // region's real, unscaled world-space size — for a library-spanning
    // "Uncategorized" region that can be several thousand CSS px across.
    // QA found allocating the actual bitmap at that size (even at DPR 1)
    // produced a multi-ten-million-pixel canvas that silently failed to
    // paint at all (rendered fully blank/white) rather than erroring. The
    // content is a sparse, soft dot field — it doesn't need a pixel-crisp
    // bitmap at world scale, especially since the outer canvas is itself
    // scaled down by the current zoom level on screen. Cap the actual
    // bitmap resolution and let the browser stretch it via CSS instead.
    const MAX_BITMAP_DIM = 480;
    const bitmapScale = Math.min(1, MAX_BITMAP_DIM / Math.max(width, height, 1));
    canvas.width = Math.max(1, Math.round(width * bitmapScale));
    canvas.height = Math.max(1, Math.round(height * bitmapScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(bitmapScale, bitmapScale);
    ctx.clearRect(0, 0, width, height);
    const dotColor = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim() || "#888888";

    // Dot count scales with sqrt(resource count) — communicates "a lot
    // more than that one" without needing one mark per actual resource.
    // Capped so a 15k-resource region doesn't cost more to draw than a
    // 50-resource one.
    const target = Math.round(Math.sqrt(count) * (dense ? 5.5 : 4));
    const dotCount = Math.max(6, Math.min(dense ? 260 : 160, target));
    const rand = mulberry32(hashSeed(seedKey));
    const radius = dense ? 1.4 : 2;

    for (let i = 0; i < dotCount; i++) {
      // Jittered grid rather than pure random — reads as an organic
      // cluster instead of accidentally clumping or leaving empty gaps.
      const cols = Math.ceil(Math.sqrt(dotCount * (width / Math.max(height, 1))));
      const rows = Math.ceil(dotCount / cols);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellW = width / cols;
      const cellH = height / rows;
      const jitterX = (rand() - 0.5) * cellW * 0.7;
      const jitterY = (rand() - 0.5) * cellH * 0.7;
      const x = cellW * (col + 0.5) + jitterX;
      const y = cellH * (row + 0.5) + jitterY;
      const alpha = 0.25 + rand() * 0.45;
      ctx.beginPath();
      ctx.fillStyle = dotColor;
      ctx.globalAlpha = alpha;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [width, height, count, seedKey, colorVar, dense]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width, height, position: "absolute", left, top, pointerEvents: "none" }}
    />
  );
}
