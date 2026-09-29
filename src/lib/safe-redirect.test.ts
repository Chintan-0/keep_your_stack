import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("passes through an ordinary relative path", () => {
    expect(safeNext("/auth/reset-password")).toBe("/auth/reset-password");
    expect(safeNext("/resources/123")).toBe("/resources/123");
  });

  it("falls back to / for null, undefined, or empty", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("rejects an absolute URL (open redirect)", () => {
    expect(safeNext("https://evil.example/phish")).toBe("/");
    expect(safeNext("http://evil.example")).toBe("/");
  });

  it("rejects a protocol-relative URL (open redirect)", () => {
    expect(safeNext("//evil.example")).toBe("/");
  });

  it("rejects a scheme embedded mid-string", () => {
    expect(safeNext("/redirect?to=https://evil.example")).toBe("/");
  });

  it("rejects a value that doesn't start with /", () => {
    expect(safeNext("evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });
});
