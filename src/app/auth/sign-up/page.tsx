"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password needs to be at least 8 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim() || undefined },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Email confirmation is off locally, so signUp already returns a live
    // session — go straight in instead of claiming we sent an email we
    // didn't. When confirmations are on (e.g. in production), there's no
    // session yet and this falls through to the "check your email" card.
    // Best-effort, fire-and-forget — never blocks the redirect below.
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "signup" }),
    }).catch(() => {});

    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="Almost there.">
        <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-success/30 bg-success-soft px-3 py-3 text-[13px] text-text-primary">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
          <span>
            We sent a confirmation link to <strong>{email}</strong>. Click it to finish creating your account.
          </span>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Build your toolbox"
      subtitle="Save what you find. Find it again months later."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
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
        <AuthField label="Name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? "Creating account…" : "Create Account"}
        </Button>
      </form>
    </AuthCard>
  );
}
