export const SHARE_VISIBILITIES = ["unlisted", "public"] as const;
export type ShareVisibility = (typeof SHARE_VISIBILITIES)[number];
export const MAX_SHARE_MESSAGE_LENGTH = 500;

export type ShareRequest =
  | { ok: true; visibility: ShareVisibility; message: string }
  | { ok: false; error: string };

// Unlisted is the default on purpose: publishing has to be an explicit choice.
export function parseShareRequest(body: unknown): ShareRequest {
  const raw = (body ?? {}) as { visibility?: unknown; message?: unknown };
  const visibility = raw.visibility ?? "unlisted";
  if (!SHARE_VISIBILITIES.includes(visibility as ShareVisibility)) {
    return { ok: false, error: "Visibility must be unlisted or public." };
  }
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length > MAX_SHARE_MESSAGE_LENGTH) {
    return { ok: false, error: `Message must be ${MAX_SHARE_MESSAGE_LENGTH} characters or fewer.` };
  }
  return { ok: true, visibility: visibility as ShareVisibility, message };
}
