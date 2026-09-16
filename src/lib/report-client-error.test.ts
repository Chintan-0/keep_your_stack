import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportClientError } from "./report-client-error";

describe("reportClientError", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a client_error event with the error's message and given path", () => {
    reportClientError(new Error("boom"), "/library");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/event",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.eventType).toBe("client_error");
    expect(body.metadata.message).toBe("boom");
    expect(body.metadata.path).toBe("/library");
  });

  it("truncates a very long message rather than sending it in full", () => {
    reportClientError(new Error("x".repeat(5000)), "/home");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.metadata.message.length).toBeLessThanOrEqual(200);
  });

  it("never throws for a non-Error value", () => {
    expect(() => reportClientError("a plain string reason", "/search")).not.toThrow();
    expect(() => reportClientError(undefined, "/search")).not.toThrow();
    expect(() => reportClientError({ weird: "object" }, "/search")).not.toThrow();
  });

  it("never throws even if fetch itself throws synchronously", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("network down");
      })
    );
    expect(() => reportClientError(new Error("boom"))).not.toThrow();
  });
});
