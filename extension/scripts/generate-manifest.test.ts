import { describe, it, expect } from "vitest";
// generate-manifest.js is plain CommonJS build tooling (excluded from lint
// and from extension/tsconfig.json's own program) — required here rather
// than imported, same as package.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseOrigins, DEFAULT_ORIGINS } = require("./generate-manifest.js");

describe("parseOrigins (extension production URL configuration)", () => {
  it("falls back to the local-dev origins when EXTENSION_APP_ORIGINS is unset", () => {
    expect(parseOrigins(undefined)).toEqual(DEFAULT_ORIGINS);
    expect(parseOrigins("")).toEqual(DEFAULT_ORIGINS);
  });

  it("parses a single production origin", () => {
    expect(parseOrigins("https://app.keepyourstack.example")).toEqual(["https://app.keepyourstack.example"]);
  });

  it("parses multiple comma-separated origins and trims whitespace", () => {
    expect(parseOrigins("https://app.example.com, http://localhost:3000")).toEqual([
      "https://app.example.com",
      "http://localhost:3000",
    ]);
  });

  it("strips a trailing slash from each origin", () => {
    expect(parseOrigins("https://app.example.com/")).toEqual(["https://app.example.com"]);
  });

  it("rejects an origin with a path — must be a bare origin", () => {
    expect(() => parseOrigins("https://app.example.com/some/path")).toThrow(/Invalid entry/);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(() => parseOrigins("ftp://example.com")).toThrow(/Invalid entry/);
  });

  it("never accepts a secret-shaped value silently — it's just validated as a malformed origin", () => {
    // Nothing about this function treats its input as anything but a URL
    // origin string; there is no path here through which a key/token could
    // end up embedded in the built manifest.json.
    expect(() => parseOrigins("sb_secret_abc123")).toThrow(/Invalid entry/);
  });
});
