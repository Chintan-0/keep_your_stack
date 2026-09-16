import { describe, it, expect, beforeEach, vi } from "vitest";

function makeChromeStub() {
  const store: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
    },
  };
}

describe("analytics.ts track()", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { chrome: unknown }).chrome = makeChromeStub();
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn();
  });

  it("posts to /api/analytics/event with an Authorization header when a session exists", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const { track } = await import("./analytics");
    await track("extension_popup_opened");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/analytics/event");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer a1");
    const body = JSON.parse(init.body as string);
    expect(body.eventType).toBe("extension_popup_opened");
  });

  it("still fires the event with no Authorization header when there is no session — extension_login_required must not require one", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const { track } = await import("./analytics");
    await track("extension_login_required");

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("never throws when the network request fails", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    const { track } = await import("./analytics");
    await expect(track("extension_save_failure")).resolves.toBeUndefined();
  });

  it("includes bounded numeric metadata when provided", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const { track } = await import("./analytics");
    await track("extension_suggestion_shown", { count: 3 });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.metadata).toEqual({ count: 3 });
  });
});
