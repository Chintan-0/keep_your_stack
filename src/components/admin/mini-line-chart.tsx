"use client";

// A tiny, dependency-free line chart — no charting library, just an inline
// SVG polyline. Keeps the admin panel from adding a new dependency for
// what's fundamentally a handful of points over a date range. Responsive
// via viewBox (no fixed pixel width), one path per series.
export function MiniLineChart({
  series,
  height = 160,
}: {
  series: { label: string; color: string; points: number[] }[];
  height?: number;
}) {
  const width = 600;
  const padding = 8;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.points));
  const pointCount = Math.max(1, ...series.map((s) => s.points.length));

  const toPath = (points: number[]) =>
    points
      .map((v, i) => {
        const x = padding + (i / Math.max(1, pointCount - 1)) * (width - padding * 2);
        const y = height - padding - (v / maxVal) * (height - padding * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  if (series.every((s) => s.points.every((v) => v === 0))) {
    return (
      <div className="flex h-40 items-center justify-center text-[12.5px] text-text-muted">
        No data in this range yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" preserveAspectRatio="none">
        {series.map((s) => (
          <path key={s.label} d={toPath(s.points)} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
