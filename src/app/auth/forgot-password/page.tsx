"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });
    setLoading(false);
    // Always show success, even on error, so this can't be used to
    // enumerate which emails have accounts.
    if (error) {
      setError(null);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="If that account exists, help is on the way.">
        <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-success/30 bg-success-soft px-3 py-3 text-[13px] text-text-primary">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
          <span>
            If <strong>{email}</strong> has a KeepYourStack account, we sent a link to reset the password.
          </span>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link href="/auth/login" className="font-medium text-accent hover:text-accent-hover">
          Back to sign in
        </Link>
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
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? "Sending…" : "Send Reset Link"}
        </Button>
      </form>
    </AuthCard>
  );
}
