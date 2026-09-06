import { describe, it, expect } from "vitest";
import { resolveInitialView, resolveResourceView } from "./view-state";

describe("resolveInitialView", () => {
  it("shows unsupported for a browser-internal page regardless of connection", () => {
    expect(resolveInitialView({ supportedUrl: false, connected: true, everConnected: true })).toBe("unsupported");
    expect(resolveInitialView({ supportedUrl: false, connected: false, everConnected: false })).toBe("unsupported");
  });

  it("shows disconnected when never connected before", () => {
    expect(resolveInitialView({ supportedUrl: true, connected: false, everConnected: false })).toBe("disconnected");
  });

  it("shows expired when previously connected but the session no longer checks out", () => {
    expect(resolveInitialView({ supportedUrl: true, connected: false, everConnected: true })).toBe("expired");
  });

  it("proceeds to a duplicate check when connected on a supported page", () => {
    expect(resolveInitialView({ supportedUrl: true, connected: true, everConnected: true })).toBe("check-duplicate");
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
