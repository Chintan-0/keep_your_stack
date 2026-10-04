import { describe, it, expect } from "vitest";
import { parseDropRequest } from "./resource-drop-validation";

describe("parseDropRequest", () => {
  it("normalizes the email and trims the message", () => {
    expect(parseDropRequest({ email: "  Ada@Example.COM ", message: " hi " }, 500)).toEqual({
      ok: true,
      email: "ada@example.com",
      message: "hi",
    });
  });

  it("rejects a missing or malformed email", () => {
    expect(parseDropRequest({}, 500).ok).toBe(false);
    expect(parseDropRequest({ email: "not-an-email" }, 500).ok).toBe(false);
    expect(parseDropRequest({ email: "a b@c.d" }, 500).ok).toBe(false);
  });

  it("rejects an overlong message", () => {
    expect(parseDropRequest({ email: "a@b.co", message: "x".repeat(501) }, 500).ok).toBe(false);
  });
});
