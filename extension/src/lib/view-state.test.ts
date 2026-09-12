import { describe, it, expect } from "vitest";
import { resolveInitialView, resolveResourceView, type ViewName } from "./view-state";
import type { ConnectionStatus } from "./api";

const CONNECTED: ConnectionStatus = { status: "connected", email: "dev@keepyourstack.local" };
const NO_SESSION: ConnectionStatus = { status: "no-session" };
const EXPIRED: ConnectionStatus = { status: "expired" };
const NETWORK_ERROR: ConnectionStatus = { status: "network-error" };

describe("resolveInitialView", () => {
  it("shows unsupported for a browser-internal page regardless of connection status", () => {
    for (const connection of [CONNECTED, NO_SESSION, EXPIRED, NETWORK_ERROR]) {
      expect(resolveInitialView({ supportedUrl: false, connection })).toBe("unsupported");
    }
  });

  it("shows disconnected when there's no stored session at all", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: NO_SESSION })).toBe("disconnected");
  });

  it("shows expired when the session existed but is no longer usable (refresh failed)", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: EXPIRED })).toBe("expired");
  });

  it("shows a connection error — distinct from expired or disconnected — for a real network/server failure", () => {
    // This is the exact classification gap the bug report called out (§10/
    // §24): a signed-in user whose network drops must see "Couldn't
    // connect", never "Session expired" or "Connect your account".
    expect(resolveInitialView({ supportedUrl: true, connection: NETWORK_ERROR })).toBe("error");
  });

  it("proceeds to a duplicate check when connected on a supported page", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: CONNECTED })).toBe("check-duplicate");
  });

  it("every ConnectionStatus variant maps to exactly one, distinct outcome (no two states share a result)", () => {
    const results = new Map<ConnectionStatus["status"], ViewName | "check-duplicate">();
    for (const connection of [CONNECTED, NO_SESSION, EXPIRED, NETWORK_ERROR]) {
      results.set(connection.status, resolveInitialView({ supportedUrl: true, connection }));
    }
    const values = [...results.values()];
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("resolveResourceView", () => {
  it("shows duplicate when a resource already exists", () => {
    expect(resolveResourceView({ id: "abc" })).toBe("duplicate");
  });

  it("shows new when nothing matched", () => {
    expect(resolveResourceView(null)).toBe("new");
  });
});

describe("state transitions (§29) — resolveInitialView is a pure function of (supportedUrl, connection), so calling it again after a change always yields a single, correct next state, never a residual one", () => {
  it("checking → disconnected", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: NO_SESSION })).toBe("disconnected");
  });
  it("checking → expired", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: EXPIRED })).toBe("expired");
  });
  it("checking → unsupported", () => {
    expect(resolveInitialView({ supportedUrl: false, connection: CONNECTED })).toBe("unsupported");
  });
  it("checking → ready (check-duplicate, then no existing resource → new/ready)", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: CONNECTED })).toBe("check-duplicate");
    expect(resolveResourceView(null)).toBe("new");
  });
  it("checking → duplicate (check-duplicate, then an existing resource → duplicate)", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: CONNECTED })).toBe("check-duplicate");
    expect(resolveResourceView({ id: "abc" })).toBe("duplicate");
  });
  it("error → checking (retry re-runs the same decision fresh, with no memory of the prior failure)", () => {
    const failed = resolveInitialView({ supportedUrl: true, connection: NETWORK_ERROR });
    expect(failed).toBe("error");
    const retried = resolveInitialView({ supportedUrl: true, connection: CONNECTED });
    expect(retried).toBe("check-duplicate");
  });
  it("expired → checking (retry after signing in again re-evaluates fresh)", () => {
    expect(resolveInitialView({ supportedUrl: true, connection: EXPIRED })).toBe("expired");
    expect(resolveInitialView({ supportedUrl: true, connection: CONNECTED })).toBe("check-duplicate");
  });
});
