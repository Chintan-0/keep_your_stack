"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Catches a render error anywhere inside the authenticated app shell so a
 * bug in one screen doesn't blank the whole tab — Next.js's error.tsx
 * convention (a client component, automatically wrapped around this
 * segment's children). `reset()` re-renders the segment; "Back to your
 * library" is the escape hatch when reset alone doesn't help.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={22} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-text-primary">Something went wrong loading this page.</p>
        <p className="max-w-sm text-[13px] text-text-secondary">
          Your data is safe — this was a display problem, not a data problem. Try again, or head back to your
          library.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => reset()}>
          Try again
        </Button>
        <Button size="sm" variant="secondary" onClick={() => router.push("/home")}>
          Back to your library
        </Button>
      </div>
    </div>
  );
}
