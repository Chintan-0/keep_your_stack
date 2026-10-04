import { describe, it, expect, vi } from "vitest";
import { copyText } from "./clipboard";

describe("copyText", () => {
  it("uses the async clipboard when it succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallbackCopy = vi.fn().mockReturnValue(true);
    expect(await copyText("https://x.test/r/abc", { clipboard: { writeText }, fallbackCopy })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x.test/r/abc");
    expect(fallbackCopy).not.toHaveBeenCalled();
  });

  it("falls back when the async clipboard is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const fallbackCopy = vi.fn().mockReturnValue(true);
    expect(await copyText("abc", { clipboard: { writeText }, fallbackCopy })).toBe(true);
    expect(fallbackCopy).toHaveBeenCalledWith("abc");
  });

  it("falls back when no async clipboard exists", async () => {
    const fallbackCopy = vi.fn().mockReturnValue(true);
    expect(await copyText("abc", { clipboard: null, fallbackCopy })).toBe(true);
  });

  it("reports failure when both methods fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const fallbackCopy = vi.fn().mockReturnValue(false);
    expect(await copyText("abc", { clipboard: { writeText }, fallbackCopy })).toBe(false);
  });

  it("reports failure when there is no clipboard and no fallback", async () => {
    expect(await copyText("abc", {})).toBe(false);
  });
});
