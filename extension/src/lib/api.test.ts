import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal in-memory stand-in for chrome.storage.local, good enough for
// storage.ts's get/set/remove usage.
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

describe("api.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { chrome: unknown }).chrome = makeChromeStub();
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn();
  });

  it("throws AuthError when there is no stored session", async () => {
    const { findExisting, AuthError } = await import("./api");
    await expect(findExisting("https://example.com")).rejects.toBeInstanceOf(AuthError);
  });

  it("saves a new resource and returns duplicate:false", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: "me@example.com" });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource: { id: "res_1", title: "React", url: "https://react.dev", stackIds: [], tagIds: [] }, duplicate: false }),
    });

    const { saveResource } = await import("./api");
    const result = await saveResource({ url: "https://react.dev", title: "React" });
    expect(result.duplicate).toBe(false);
    expect(result.resource.id).toBe("res_1");

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer a1");
  });

  it("always tags a save with importSource: chrome-extension, regardless of caller input", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource: { id: "res_1", title: "React", url: "https://react.dev", stackIds: [], tagIds: [] }, duplicate: false }),
    });

    const { saveResource } = await import("./api");
    await saveResource({ url: "https://react.dev", title: "React" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.importSource).toBe("chrome-extension");
  });

  it("suggestOrganization posts to /api/resources/suggest and returns the parsed suggestion", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const suggestion = {
      domain: "react.dev",
      domainTotal: 4,
      confident: true,
      category: { id: "cat_1", confidence: "high" },
      stack: { id: "stack_1", name: "Frontend", icon: "🌐" },
      tags: ["react"],
      usefulFor: null,
      reasons: ["4 resources from react.dev are in Frontend"],
    };
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => suggestion });

    const { suggestOrganization } = await import("./api");
    const result = await suggestOrganization("https://react.dev", "React");
    expect(result).toEqual(suggestion);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/resources/suggest");
  });

  it("suggestOrganization never throws — a failed request resolves to null", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const { suggestOrganization } = await import("./api");
    await expect(suggestOrganization("https://react.dev", "React")).resolves.toBeNull();
  });

  it("reports a duplicate without creating a second resource", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource: { id: "res_1", title: "React", url: "https://react.dev", stackIds: [], tagIds: [] }, duplicate: true }),
    });

    const { saveResource } = await import("./api");
    const result = await saveResource({ url: "https://react.dev", title: "React" });
    expect(result.duplicate).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes an expired access token once and retries, rather than failing the save", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "stale", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }) // first attempt: stale token
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: "fresh", refreshToken: "r2", expiresAt: 9999999999 }) }) // refresh
      .mockResolvedValueOnce({ ok: true, json: async () => ({ resource: { id: "res_1", title: "React", url: "https://react.dev", stackIds: [], tagIds: [] }, duplicate: false }) }); // retried save

    const { saveResource } = await import("./api");
    const result = await saveResource({ url: "https://react.dev", title: "React" });

    expect(result.duplicate).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryInit = fetchMock.mock.calls[2][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer fresh");
  });

  it("surfaces AuthError and clears the session when the refresh token is also rejected", async () => {
    const { setSession, getSession } = await import("./storage");
    await setSession({ accessToken: "stale", refreshToken: "dead", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "Session expired" }) });

    const { saveResource, AuthError } = await import("./api");
    await expect(saveResource({ url: "https://react.dev", title: "React" })).rejects.toBeInstanceOf(AuthError);
    expect(await getSession()).toBeNull();
  });

  it("checkConnection: no-session when nothing is stored (never classified as expired or a network error)", async () => {
    const { checkConnection } = await import("./api");
    expect(await checkConnection()).toEqual({ status: "no-session" });
  });

  it("checkConnection: connected on a healthy authenticated response", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ user: { email: "dev@keepyourstack.local" } }) });

    const { checkConnection } = await import("./api");
    expect(await checkConnection()).toEqual({ status: "connected", email: "dev@keepyourstack.local" });
  });

  it("checkConnection: expired — distinct from a network error — when the refresh flow definitively fails", async () => {
    // This is the exact bug-report gap (§10/§24): a real session that has
    // expired must classify as "expired", not the same generic bucket as
    // an offline network or 500 response.
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "stale", refreshToken: "dead", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "Session expired" }) });

    const { checkConnection } = await import("./api");
    expect(await checkConnection()).toEqual({ status: "expired" });
  });

  it("checkConnection: network-error — distinct from expired — when the request itself fails (e.g. offline)", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { checkConnection } = await import("./api");
    expect(await checkConnection()).toEqual({ status: "network-error" });
  });

  it("checkConnection: network-error — not expired — on a non-401 server failure", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const { checkConnection } = await import("./api");
    expect(await checkConnection()).toEqual({ status: "network-error" });
  });

  it("wraps a non-401 API failure in ApiError with a human-readable message", async () => {
    const { setSession } = await import("./storage");
    await setSession({ accessToken: "a1", refreshToken: "r1", expiresAt: null, userEmail: null });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Something broke" }) });

    const { saveResource, ApiError } = await import("./api");
    await expect(saveResource({ url: "https://react.dev", title: "React" })).rejects.toThrow("Something broke");
    try {
      await saveResource({ url: "https://react.dev", title: "React" });
      throw new Error("expected saveResource to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
    }
  });
});
