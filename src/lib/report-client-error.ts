/**
 * Minimal client-side error reporting (Phase 16 §12) — posts to the same
 * `/api/analytics/event` endpoint every other client event already uses
 * (see src/lib/data/analytics.ts's `logServerError` for the server-side
 * half). Never sends a stack trace or anything user-typed: just the
 * error's own message (truncated) and which route it happened on.
 * Fire-and-forget, and never throws — error reporting must never itself
 * become a source of errors.
 */
export function reportClientError(error: unknown, path?: string) {
  try {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventType: "client_error",
        metadata: { message: message.slice(0, 200), path: path ?? (typeof window !== "undefined" ? window.location.pathname : undefined) },
      }),
    }).catch(() => {});
  } catch {
    // Never let error reporting itself throw.
  }
}
