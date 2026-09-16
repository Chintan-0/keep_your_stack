import { getSession, getSettings } from "./storage.js";

/**
 * Fire-and-forget product-analytics beacon for the extension — hits the
 * same /api/analytics/event endpoint the web app uses (see src/app/api/
 * analytics/event/route.ts), attaching the stored session's access token
 * when one exists so the event is attributed to the right user, but never
 * requiring one: extension_login_required specifically fires when there
 * is NO session, so this must still record the event (unattributed)
 * rather than throwing or refusing.
 *
 * Never blocks or fails the action it's attached to — every call site
 * uses `void track(...)`, and every failure here (network, 4xx, whatever)
 * is swallowed silently. Metadata is deliberately tiny: only what the
 * server's own allowlist already accepts (a handful of named counts/ids —
 * see the route) — never page contents, never free text, never anything
 * resembling browsing history beyond the one page the user explicitly
 * acted on.
 */
export type ExtensionEventType =
  | "extension_popup_opened"
  | "extension_metadata_loaded"
  | "extension_suggestion_shown"
  | "extension_suggestion_changed"
  | "extension_save_started"
  | "extension_save_success"
  | "extension_save_failure"
  | "extension_duplicate_detected"
  | "extension_login_required";

export async function track(eventType: ExtensionEventType, metadata?: Record<string, number>): Promise<void> {
  try {
    const [{ appUrl }, session] = await Promise.all([getSettings(), getSession()]);
    await fetch(`${appUrl}/api/analytics/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: JSON.stringify({ eventType, metadata }),
    });
  } catch {
    // Analytics must never surface an error to the user or affect the save/organize flow it's attached to.
  }
}
