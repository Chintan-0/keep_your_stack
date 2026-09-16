"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Quick Access (Part I/J). device_id is a random, non-secret identifier
// kept in localStorage — it carries no authentication power of its own,
// it only labels which already-authenticated browser this is so the
// owner can see/name/revoke it later. Real authentication is entirely
// Supabase's own session (already persisted via secure cookies); this
// component reuses it rather than inventing a second auth mechanism —
// "sign out other devices" below is a genuine, server-enforced Supabase
// call (auth.signOut({scope:"others"})), not something this table does
// on its own.
const DEVICE_ID_KEY = "kys_device_id";

interface Device {
  id: string;
  device_id: string;
  label: string | null;
  created_at: string;
  last_seen_at: string;
}

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "Browser";
  const os = /windows/i.test(ua) ? "Windows" : /mac os x/i.test(ua) ? "macOS" : /android/i.test(ua) ? "Android" : /iphone|ipad/i.test(ua) ? "iOS" : /linux/i.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function formatLastUsed(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function QuickAccessSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  async function loadDevices() {
    try {
      const res = await fetch("/api/quick-access/devices");
      const body = await res.json();
      if (res.ok) setDevices(body.devices ?? []);
    } catch {
      // Non-critical section — a failed load just shows nothing rather than an error banner.
    }
  }

  useEffect(() => {
    // Reading/writing localStorage can only safely happen post-mount
    // (server has no localStorage) — same justified-effect pattern as
    // resources/page.tsx's location-filter read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThisDeviceId(getOrCreateDeviceId());
    void loadDevices();
  }, []);

  async function enableQuickAccess() {
    if (!thisDeviceId) return;
    setEnabling(true);
    try {
      const res = await fetch("/api/quick-access/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: thisDeviceId, label: guessDeviceLabel() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Quick Access enabled on this device");
      await loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't enable Quick Access.");
    } finally {
      setEnabling(false);
    }
  }

  async function revokeDevice(id: string) {
    try {
      const res = await fetch(`/api/quick-access/devices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove this device.");
    }
  }

  async function signOutOtherDevices() {
    setSigningOutOthers(true);
    try {
      const supabase = createClient();
      // The real, server-enforced revocation — Supabase invalidates every
      // OTHER session's refresh token. This device's own session is
      // untouched (scope: "others").
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      // Those devices' sessions are dead now — their bookkeeping rows would just be stale, so clear them too.
      const others = (devices ?? []).filter((d) => d.device_id !== thisDeviceId);
      await Promise.all(others.map((d) => fetch(`/api/quick-access/devices/${d.id}`, { method: "DELETE" })));
      toast.success("Signed out of all other devices");
      await loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign out other devices.");
    } finally {
      setSigningOutOthers(false);
    }
  }

  const thisDevice = devices?.find((d) => d.device_id === thisDeviceId);
  const otherDevices = (devices ?? []).filter((d) => d.device_id !== thisDeviceId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Smartphone size={16} className="text-text-muted" />
          <div>
            <p className="text-[13px] font-medium text-text-primary">This device</p>
            {thisDevice ? (
              <p className="flex items-center gap-1 text-[12px] text-success">
                <ShieldCheck size={12} /> Enabled · Last used {formatLastUsed(thisDevice.last_seen_at)}
              </p>
            ) : (
              <p className="text-[12px] text-text-muted">Not enabled on this device</p>
            )}
          </div>
        </div>
        {thisDevice ? (
          <Button variant="secondary" size="sm" onClick={() => revokeDevice(thisDevice.id)}>
            Disable Quick Access
          </Button>
        ) : (
          <Button size="sm" onClick={enableQuickAccess} disabled={enabling}>
            {enabling ? "Enabling…" : "Enable Quick Access"}
          </Button>
        )}
      </div>

      {otherDevices.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-text-secondary">Other devices</p>
          {otherDevices.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border px-3 py-2">
              <span className="text-[12.5px] text-text-primary">
                {d.label || "Unnamed device"} <span className="text-text-muted">· Last used {formatLastUsed(d.last_seen_at)}</span>
              </span>
              <button
                onClick={() => revokeDevice(d.id)}
                className="text-[12px] text-danger hover:underline cursor-pointer"
              >
                Revoke
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" className="w-fit" onClick={signOutOtherDevices} disabled={signingOutOthers}>
            {signingOutOthers ? "Signing out…" : "Sign out all other devices"}
          </Button>
        </div>
      )}
    </div>
  );
}
