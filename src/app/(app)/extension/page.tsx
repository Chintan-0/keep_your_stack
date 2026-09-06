"use client";

import { useEffect, useState } from "react";
import { Puzzle, CheckCircle2, Circle, FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type BridgeState = "idle" | "connecting" | "connected" | "unavailable";

export default function ExtensionPage() {
  const [bridgeState, setBridgeState] = useState<BridgeState>("idle");

  useEffect(() => {
    // Real, not assumed: this only flips to "connected" when the content
    // script (extension/src/content/bridge.ts) actually relays the ack
    // back — see the CustomEvent dance below. If the extension isn't
    // installed, nothing ever answers and the button just re-enables.
    function onConnected() {
      setBridgeState("connected");
    }
    window.addEventListener("keepyourstack:connected", onConnected);
    return () => window.removeEventListener("keepyourstack:connected", onConnected);
  }, []);

  async function connectExtension() {
    setBridgeState("connecting");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setBridgeState("unavailable");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("keepyourstack:connect", {
        detail: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at ?? null,
          userEmail: session.user.email ?? null,
        },
      })
    );

    // No listener answers within a couple seconds → the extension isn't
    // installed/loaded in this browser. We say so plainly rather than
    // leaving the button spinning forever.
    setTimeout(() => {
      setBridgeState((s) => (s === "connecting" ? "unavailable" : s));
    }, 2500);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Puzzle size={19} /> Save from your browser
        </h1>
        <p className="max-w-xl text-[13px] text-text-secondary">
          Save useful websites directly from Chrome without leaving the page.
        </p>
        <p className="max-w-xl text-[13px] font-medium text-text-primary">One click → saved to KeepYourStack</p>
      </div>

      {/* Connection status */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {bridgeState === "connected" ? (
              <CheckCircle2 size={18} className="text-success" />
            ) : (
              <Circle size={18} className="text-text-muted" />
            )}
            <div>
              <p className="text-[13.5px] font-medium text-text-primary">
                {bridgeState === "connected" ? "Extension connected" : "Extension not detected"}
              </p>
              <p className="text-[12px] text-text-secondary">
                {bridgeState === "connected"
                  ? "Saves from the extension will land in this account."
                  : bridgeState === "connecting"
                    ? "Waiting for the extension to respond…"
                    : bridgeState === "unavailable"
                      ? "No response from an installed extension. Load it (below), then try again."
                      : "Load the extension, then connect it to this account."}
              </p>
            </div>
          </div>
          <Button
            variant={bridgeState === "connected" ? "secondary" : "primary"}
            size="sm"
            onClick={connectExtension}
            disabled={bridgeState === "connecting"}
          >
            {bridgeState === "connected" ? "Reconnect" : "Connect Extension"}
          </Button>
        </div>
      </div>

      {/* Install instructions (local dev — not yet on the Chrome Web Store) */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
          <FolderOpen size={14} /> Load unpacked extension
        </h2>
        <p className="text-[13px] text-text-secondary">
          The extension isn&apos;t on the Chrome Web Store yet — for now, load it directly from this project:
        </p>
        <ol className="flex flex-col gap-1.5 text-[13px] text-text-primary">
          <li>1. In the project, run <code className="font-mono text-[12px] text-accent">npm run build:extension</code>.</li>
          <li>
            2. Open <code className="font-mono text-[12px] text-accent">chrome://extensions</code> and turn on{" "}
            <strong className="font-medium">Developer mode</strong> (top right).
          </li>
          <li>
            3. Click <strong className="font-medium">Load unpacked</strong> and select this project&apos;s{" "}
            <code className="font-mono text-[12px] text-accent">extension/</code> folder.
          </li>
          <li>4. Come back here and click Connect Extension above.</li>
        </ol>
        <p className="text-[12px] text-text-muted">Full steps: extension/README.md.</p>
      </section>

      {/* What it captures */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">What it captures</h2>
        <ul className="grid grid-cols-1 gap-1.5 text-[13.5px] text-text-primary sm:grid-cols-2">
          <li>• Page title</li>
          <li>• URL</li>
          <li>• Favicon</li>
          <li>• Optional Useful For</li>
          <li>• Optional Stack</li>
          <li>• Optional Tags</li>
          <li>• Optional Note</li>
        </ul>
        <p className="text-[12.5px] text-text-secondary">
          It won&apos;t run in the background, sync automatically, or read your existing bookmarks — it only saves
          the one page you click it on.
        </p>
      </section>

      {/* Separate from bookmark import */}
      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">Chrome bookmarks</h2>
        <p className="text-[13px] text-text-secondary">
          If you want to bring in bookmarks you&apos;ve already saved, use{" "}
          <a href="/import" className="text-accent hover:text-accent-hover">
            Import Bookmarks
          </a>{" "}
          instead — that&apos;s a separate, one-time import from a browser export file, not something this
          extension does automatically.
        </p>
      </section>
    </div>
  );
}
