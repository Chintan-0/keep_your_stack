import { describe, it, expect } from "vitest";
import { parseShareRequest, MAX_SHARE_MESSAGE_LENGTH } from "./resource-share-validation";

describe("parseShareRequest", () => {
  it("defaults to unlisted when visibility is omitted", () => {
    expect(parseShareRequest({})).toEqual({ ok: true, visibility: "unlisted", message: "" });
  });

  it("accepts public explicitly and trims the message", () => {
    expect(parseShareRequest({ visibility: "public", message: "  try this  " })).toEqual({
      ok: true,
      visibility: "public",
      message: "try this",
    });
  });

  it("rejects any other visibility", () => {
    expect(parseShareRequest({ visibility: "private" }).ok).toBe(false);
    expect(parseShareRequest({ visibility: ["public"] }).ok).toBe(false);
  });

  it("rejects an overlong message", () => {
    const result = parseShareRequest({ message: "a".repeat(MAX_SHARE_MESSAGE_LENGTH + 1) });
    expect(result.ok).toBe(false);
  });

  it("treats a non-string message as empty", () => {
    expect(parseShareRequest({ message: 42 })).toEqual({ ok: true, visibility: "unlisted", message: "" });
  });
});
