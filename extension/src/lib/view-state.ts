// Pure decision logic factored out of popup.ts so it's testable without a
// DOM/chrome.* environment — see view-state.test.ts. popup.ts is the only
// place these are wired up to actual rendering.

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
  connected: boolean;
  everConnected: boolean;
}): ViewName | "check-duplicate" {
  if (!input.supportedUrl) return "unsupported";
  if (!input.connected) return input.everConnected ? "expired" : "disconnected";
  return "check-duplicate";
}

export function resolveResourceView(existing: unknown): "duplicate" | "new" {
  return existing ? "duplicate" : "new";
}
