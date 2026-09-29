"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Official Google "G" mark (four-color, per Google's brand guidelines) —
// no icon library ships brand marks, so this is inlined rather than
// pulled in as a dependency for one icon.
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.68-3.88 2.68-6.61z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Starts the Supabase Google OAuth flow. Google Cloud/Supabase provider
 * config already exists (client id/secret, redirect URLs) — this only
 * ever calls supabase.auth.signInWithOAuth, which redirects the browser
 * to Google and back to /auth/callback; there's nothing else to do here
 * on success. `next` (when it's the same page the caller already had one
 * for, e.g. the login form's own `?next=`) is round-tripped through the
 * callback the same way the email/password flow does.
 */
export function GoogleSignInButton({ next, onError }: { next?: string | null; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    onError("");
    setLoading(true);
    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next && next !== "/") redirectTo.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) {
      onError(error.message || "Could not start Google sign-in.");
      setLoading(false);
    }
    // No `else`: success means the browser is already navigating to
    // Google, so there's nothing left to render here.
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 text-[13.5px] font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    >
      <GoogleMark />
      {loading ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
