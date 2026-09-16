"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

// Dev-only convenience: auto-signs in as a fixed local account so you don't
// have to log in by hand while testing. `NODE_ENV === "development"` is
// inlined at build time, so this whole branch — credentials included — is
// stripped out of `next build`/`next start`; it only ever runs under
// `next dev`. Create the account once with `node scripts/create-dev-user.mjs`
// (needed again after any `supabase db reset`).
const DEV_USER =
  process.env.NODE_ENV === "development"
    ? { email: "dev@keepyourstack.local", password: "devpassword123" }
    : null;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEV_USER?.email ?? "");
  const [password, setPassword] = useState(DEV_USER?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoLoggingIn, setAutoLoggingIn] = useState(!!DEV_USER);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function signIn(signInEmail: string, signInPassword: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: signInEmail, password: signInPassword });
    if (error) return error;
    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    // "/" is the public marketing homepage now, never a meaningful page to
    // return a just-signed-in user to — treat it the same as no `next` at all.
    router.push(next && next !== "/" ? next : "/home");
    router.refresh();
    return null;
  }

  useEffect(() => {
    if (!DEV_USER) return;
    signIn(DEV_USER.email, DEV_USER.password).then((error) => {
      if (error) {
        // Dev account probably doesn't exist yet — fall back to the normal
        // form (already pre-filled) instead of getting stuck.
        setAutoLoggingIn(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const error = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    } else {
      // Real, user-initiated sign-in only — not the dev auto-login above.
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "login" }),
      }).catch(() => {});
    }
  }

  if (autoLoggingIn) {
    return (
      <AuthCard title="Signing you in…" subtitle="Dev auto-login — one moment.">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome to KeepYourStack"
      subtitle="Sign in to get back to your stack."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/auth/sign-up" className="font-medium text-accent hover:text-accent-hover">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {DEV_USER && (
          <div className="rounded-[var(--radius-sm)] border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
            Dev mode: auto-login failed (run <code className="font-mono">node scripts/create-dev-user.mjs</code>).
            Form is pre-filled — just hit Sign In.
          </div>
        )}
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-secondary">Password</span>
            <Link href="/auth/forgot-password" className="text-[12px] text-accent hover:text-accent-hover">
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <input
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-3 pr-10 text-[13.5px] text-text-primary focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((v) => !v)}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-pressed={passwordVisible}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted hover:text-text-secondary focus:outline-none focus-visible:text-accent"
            >
              {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </AuthCard>
  );
}
