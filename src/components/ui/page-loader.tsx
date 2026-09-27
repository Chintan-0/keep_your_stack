import { KysLoader } from "./kys-loader";

/**
 * Route-level loading state (Next.js `loading.tsx` boundaries) — covers
 * the route JS chunk load / server render, not client data fetching
 * (which each page already handles itself via skeletons/store state).
 * Kept intentionally small and generic rather than per-route, since this
 * only ever shows briefly during navigation.
 */
export function PageLoader({ label = "Loading your toolbox" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <KysLoader size="md" />
      <p className="text-[13px] text-text-secondary">{label}</p>
    </div>
  );
}
