import { describe, it, expect } from "vitest";
import { validateUsername } from "./username-validation";

describe("validateUsername", () => {
  it("accepts a normal username and lowercases it", () => {
    const result = validateUsername("Chintan");
    expect(result).toEqual({ ok: true, username: "chintan" });
  });

  it("rejects too short / too long", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(31)).ok).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(validateUsername("chin tan").ok).toBe(false);
    expect(validateUsername("chintan!").ok).toBe(false);
    expect(validateUsername("chintan.dev").ok).toBe(false);
  });

  it("allows letters, numbers, underscore, hyphen", () => {
    expect(validateUsername("chin_tan-99").ok).toBe(true);
  });

  it("rejects reserved/system-route names, case-insensitively", () => {
    expect(validateUsername("admin").ok).toBe(false);
    expect(validateUsername("ADMIN").ok).toBe(false);
    expect(validateUsername("settings").ok).toBe(false);
    expect(validateUsername("api").ok).toBe(false);
    expect(validateUsername("share").ok).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(validateUsername("  chintan  ")).toEqual({ ok: true, username: "chintan" });
  });
});
