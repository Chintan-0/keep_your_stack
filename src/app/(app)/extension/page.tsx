"use client";

import { useEffect, useState } from "react";
import { Puzzle, CheckCircle2, Circle, FolderOpen, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const EXTENSION_ZIP_URL = "/downloads/keepyourstack-chrome-extension.zip";

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
          <Puzzle size={19} /> KeepYourStack Chrome Extension
        </h1>
        <p className="max-w-xl text-[13px] text-text-secondary">
          Save websites to your KeepYourStack library directly from Chrome.
        </p>
      </div>

      {/* Download */}
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <a
          href={EXTENSION_ZIP_URL}
          download
          className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] bg-accent px-5 text-[15px] font-medium text-white shadow-sm shadow-accent/20 transition-colors duration-150 hover:bg-accent-hover cursor-pointer"
        >
          <Download size={16} /> Download for Chrome
        </a>
        <p className="text-[12.5px] text-text-secondary">
          This installs as an unpacked, developer-mode extension — it isn&apos;t on the Chrome Web Store yet. See the
          install steps below.
        </p>
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
          <FolderOpen size={14} /> Installation
        </h2>
        <p className="text-[13px] text-text-secondary">
          This is currently a developer-mode (unpacked) Chrome extension — it isn&apos;t published on the Chrome Web
          Store yet, so Chrome will need you to load it manually. That&apos;s normal and only takes a minute:
        </p>
        <ol className="flex flex-col gap-1.5 text-[13px] text-text-primary">
          <li>1. Download the extension ZIP (button above).</li>
          <li>2. Extract the ZIP.</li>
          <li>
            3. Open <code className="font-mono text-[12px] text-accent">chrome://extensions</code>.
          </li>
          <li>
            4. Enable <strong className="font-medium">Developer mode</strong> (top right).
          </li>
          <li>
            5. Click <strong className="font-medium">Load unpacked</strong>.
          </li>
          <li>6. Select the extracted KeepYourStack extension folder.</li>
          <li>7. Pin KeepYourStack to the Chrome toolbar if desired.</li>
          <li>8. Sign in to KeepYourStack and start saving resources — click Connect Extension above once it&apos;s loaded.</li>
        </ol>
        <p className="text-[12px] text-text-muted">
          Building from source instead? Run <code className="font-mono text-[11.5px] text-accent">npm run build:extension</code>{" "}
          and load this project&apos;s <code className="font-mono text-[11.5px] text-accent">extension/</code> folder directly.
          Full details: extension/README.md.
        </p>
      </section>

      {/* Ways to save */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">Ways to save</h2>
        <ul className="grid grid-cols-1 gap-1.5 text-[13.5px] text-text-primary sm:grid-cols-2">
          <li>• Click the toolbar icon → Save</li>
          <li>• Right-click a page → Save to KeepYourStack</li>
          <li>• Right-click a link → Save link to KeepYourStack</li>
          <li>
            •{" "}
            <kbd className="rounded border border-border bg-surface-3 px-1 py-0.5 font-mono text-[11px]">
              Ctrl/Cmd+Shift+K
            </kbd>{" "}
            keyboard shortcut
          </li>
        </ul>
        <p className="text-[12.5px] text-text-secondary">
          A context-menu or shortcut save shows a quiet Chrome notification instead of the popup (toggle it off in
          the extension&apos;s Options if you&apos;d rather stay silent). Chrome may already use that shortcut for
          something else — check <code className="font-mono text-[11.5px] text-accent">chrome://extensions/shortcuts</code> if
          it doesn&apos;t fire.
        </p>
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
          <li>• Optional Category</li>
          <li>• Optional Tags</li>
          <li>• Optional Note</li>
        </ul>
        <p className="text-[12.5px] text-text-secondary">
          It won&apos;t run in the background, sync automatically, or read your existing bookmarks — it only saves
          the one page (or link) you tell it to. A description, tags, and Useful For are found automatically after
          the save, the same way importing or adding a resource in the web app already works — that never blocks the
          save itself.
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
