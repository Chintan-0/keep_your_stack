"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportClientError } from "@/lib/report-client-error";

// First-party, privacy-conscious visitor analytics — see src/lib/data/
// analytics.ts's header comment for exactly what's collected and why.
// Mounted once in the root layout (src/app/layout.tsx) so it covers every
// route, public and app alike — a real visitor-analytics tool has to see
// the marketing/auth pages too, not just the signed-in app.
//
// Visitor id: a random UUID (crypto.randomUUID(), never derived from IP
// or any other identifying signal), kept in localStorage so it survives
// reloads but resets if the visitor clears site data or uses a different
// browser/device. Identifies a browser, not a person.
//
// Session id: also a random UUID, kept alongside a last-activity
// timestamp. A gap longer than SESSION_TIMEOUT_MS since the last tracked
// page view starts a new session (new id) — see the matching definition
// and constant in src/lib/data/analytics.ts.
const VISITOR_ID_KEY = "kys_visitor_id";
const SESSION_KEY = "kys_session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode, disabled storage) — fall
    // back to an ephemeral id for this page load only rather than failing.
    return crypto.randomUUID();
  }
}

function getSessionId(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const now = Date.now();
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; lastActivity: number };
      if (now - parsed.lastActivity < SESSION_TIMEOUT_MS) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, lastActivity: now }));
        return parsed.id;
      }
    }
    const id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActivity: now }));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();

  // Minimal production error observability (§12) — catches errors React's
  // own error boundaries can't (event handlers, timers, promise
  // rejections). A React render error is caught separately by
  // src/app/(app)/error.tsx and src/app/global-error.tsx, which call
  // reportClientError directly. Mounted once, not per-pathname.
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientError(event.error ?? event.message);
    }
    function onRejection(event: PromiseRejectionEvent) {
      reportClientError(event.reason);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    // Never track admin pages themselves, and never let a tracking failure
    // surface anywhere — this is purely best-effort, fire-and-forget.
    if (pathname.startsWith("/admin")) return;
    try {
      const visitorId = getVisitorId();
      const sessionId = getSessionId();
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          visitorId,
          sessionId,
          path: pathname,
          referrer: document.referrer || null,
        }),
      }).catch(() => {});
    } catch {
      // Never let analytics break navigation.
    }
  }, [pathname]);

  return null;
}
