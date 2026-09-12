// A tiny sequence guard against stale-async-response races (see popup.ts's
// startupRequestId): each call to start() marks a new attempt as "the
// current one" and returns a token for it; isCurrent(token) is true only
// for the token belonging to the most recently started attempt. An older,
// slower attempt that finishes after a newer one has already started can
// check isCurrent() right before it renders anything and simply bail out
// instead of overwriting the newer attempt's result — this is what makes
// "only the latest active startup may update the UI" (ticket §18) an
// enforced property rather than a hope about timing.
export function createSequenceGuard() {
  // -1 is a sentinel meaning "no attempt has started yet" — deliberately
  // distinct from any value start() can actually return (0, 1, 2, …), so
  // a fresh, never-started guard correctly treats every token as stale
  // rather than accidentally matching token 0.
  let current = -1;
  return {
    /** Marks a new attempt as current; returns its token. */
    start(): number {
      current += 1;
      return current;
    },
    /** True only if `token` belongs to the most recently started attempt. */
    isCurrent(token: number): boolean {
      return token === current;
    },
  };
}
