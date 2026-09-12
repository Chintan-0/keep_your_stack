// Pure decision logic factored out of popup.ts so it's testable without a
// DOM/chrome.* environment — see view-state.test.ts. popup.ts is the only
// place these are wired up to actual rendering.
//
// This is the single authoritative place startup state is *decided* —
// popup.ts's async helpers (checkConnection, findExisting, tab detection)
// only ever return data/results; none of them render UI directly. That
// separation is what makes "exactly one state renders" a property of the
// data flow rather than something enforced by convention: there is
// nowhere else a competing top-level view could come from.

import type { ConnectionStatus } from "./api.js";

export type ViewName =
  | "loading"
  | "disconnected"
  | "expired"
  | "unsupported"
  | "error"
  | "duplicate"
  | "new"
  | "saving"
  | "success";

export function resolveInitialView(input: {
  supportedUrl: boolean;
  connection: ConnectionStatus;
}): ViewName | "check-duplicate" {
  if (!input.supportedUrl) return "unsupported";
  switch (input.connection.status) {
    case "no-session":
      return "disconnected";
    case "expired":
      return "expired";
    case "network-error":
      return "error";
    case "connected":
      return "check-duplicate";
  }
}

export function resolveResourceView(existing: unknown): "duplicate" | "new" {
  return existing ? "duplicate" : "new";
}
