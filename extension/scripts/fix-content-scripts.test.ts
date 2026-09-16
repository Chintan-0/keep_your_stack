import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripTrailingExport } = require("./fix-content-scripts.js");

// Regression test for a real production bug: TypeScript's isolatedModules
// appends an empty `export {};` to any compiled file with zero import/
// export statements — valid for a real ES module, but Chrome loads
// content scripts (unlike the background service worker or popup/options,
// which do support "type": "module") as classic, non-module scripts, so
// that trailing `export {};` was an "Uncaught SyntaxError: Unexpected
// token 'export'" at runtime, breaking the extension's web-app-to-
// extension connect bridge in production.
describe("stripTrailingExport (fixes a real content-script syntax error)", () => {
  it("strips a trailing bare export statement", () => {
    const input = "console.log('hi');\nexport {};\n";
    expect(stripTrailingExport(input)).toBe("console.log('hi');\n");
  });

  it("strips it without a trailing newline", () => {
    expect(stripTrailingExport("console.log('hi');\nexport {};")).toBe("console.log('hi');\n");
  });

  it("leaves a file with no trailing export unchanged", () => {
    const input = "console.log('hi');\n";
    expect(stripTrailingExport(input)).toBe(input);
  });

  it("never touches a real export statement that isn't the trailing empty one", () => {
    const input = "export function foo() {}\n";
    expect(stripTrailingExport(input)).toBe(input);
  });
});
