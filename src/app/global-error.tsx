"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Catches an error in the root layout itself (rare — most errors are
 * caught by the narrower src/app/(app)/error.tsx). Next.js requires this
 * file to render its own <html>/<body> since it replaces the root layout
 * entirely when it activates. Kept intentionally minimal/inline-styled —
 * this is the one screen where the normal design system and Tailwind
 * build might themselves be the thing that failed to load.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0a0c11", color: "#e8eaf0", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            textAlign: "center",
            padding: 24,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong.</p>
          <p style={{ fontSize: 13, color: "#a3a9b8", maxWidth: 360 }}>
            KeepYourStack hit an unexpected error. Your saved resources are safe — try reloading the page.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#6f7bff",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
