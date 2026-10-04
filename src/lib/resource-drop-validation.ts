export const MAX_DROP_RECIPIENT_EMAIL_LENGTH = 254;

export type DropRequest =
  | { ok: true; email: string; message: string }
  | { ok: false; error: string };

// Exact-match lookup needs a normalized address; the regex only rejects obvious junk, not every valid RFC 5322 address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseDropRequest(body: unknown, maxMessageLength: number): DropRequest {
  const raw = (body ?? {}) as { email?: unknown; message?: unknown };
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_DROP_RECIPIENT_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length > maxMessageLength) {
    return { ok: false, error: `Message must be ${maxMessageLength} characters or fewer.` };
  }
  return { ok: true, email, message };
}
