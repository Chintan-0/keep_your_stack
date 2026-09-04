"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      return;
    }
    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    router.push(next || "/");
    router.refresh();
  }

  return (
    <AuthCard
      title="Welcome back"
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
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-3 text-[13.5px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </AuthCard>
  );
}
