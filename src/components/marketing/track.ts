// Fire-and-forget homepage analytics — same /api/analytics/event endpoint
// and allowlist every other client-fired event already uses (see
// src/app/api/analytics/event/route.ts). Never blocks navigation or a
// CTA click: every call site uses `void track(...)`, and any failure here
// is silently swallowed. `label` is always one of this file's OWN
// hardcoded strings (which CTA, which demo query) — never user-typed
// text, page contents, or anything resembling browsing history.
export type HomepageEvent =
  | "homepage_viewed"
  | "homepage_cta_clicked"
  | "homepage_demo_interacted"
  | "homepage_extension_clicked"
  | "homepage_signup_clicked"
  | "homepage_login_clicked";

export function track(eventType: HomepageEvent, label?: string) {
  try {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ eventType, metadata: label ? { label } : undefined }),
    }).catch(() => {});
  } catch {
    // Never let analytics break the homepage.
  }
}
