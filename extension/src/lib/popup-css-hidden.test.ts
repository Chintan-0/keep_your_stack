import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Regression test for the actual root cause of "multiple popup states
// rendered at once" (see popup.css's own comment above the fix, and
// popup.ts's show()): several classes in this stylesheet (.view,
// .details, .disclosure) set their own `display` value. An attribute
// selector and a class selector tie on specificity, and an author
// stylesheet always wins that tie over the browser's built-in
// `[hidden] { display: none }` rule — so without an explicit, authoritative
// `[hidden]` rule of its own, every `<section class="view" hidden>` was
// rendered as a visible flex box the whole time, regardless of what
// popup.ts's single-state show() function correctly set `hidden` to.
//
// This can't be verified by rendering (no jsdom/browser test environment
// exists in this project — see vitest.config.ts's `environment: "node"`),
// but the fix is a specific, checkable stylesheet property: a `[hidden]`
// rule forcing `display: none` with enough weight to win regardless of
// any other class's own `display`. This test fails if that rule is ever
// removed, weakened (no `!important`), or overridden by a later rule.
describe("popup.css [hidden] rule (regression: multiple popup states rendered at once)", () => {
  const cssPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "popup.css");
  const css = readFileSync(cssPath, "utf8");

  // Strip comments so a `[hidden]` rule inside a /* ... */ block (e.g. in
  // this exact explanatory comment, if ever pasted into the file) can't
  // produce a false pass.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("declares an authoritative [hidden] rule with !important", () => {
    const match = withoutComments.match(/\[hidden\]\s*\{([^}]*)\}/);
    expect(match, "expected a [hidden] { ... } rule in popup.css").not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/display\s*:\s*none\s*!important/);
  });

  it("the [hidden] rule appears before every class that sets its own display (so intent is clear even though !important makes order irrelevant)", () => {
    const hiddenRuleIndex = withoutComments.indexOf("[hidden]");
    const viewRuleIndex = withoutComments.indexOf(".view {");
    expect(hiddenRuleIndex).toBeGreaterThan(-1);
    expect(viewRuleIndex).toBeGreaterThan(-1);
    expect(hiddenRuleIndex).toBeLessThan(viewRuleIndex);
  });

  it("every class known to be toggled via the `hidden` DOM property in popup.ts also sets its own `display` — documenting exactly why the global [hidden] rule (not per-class patches) is the correct fix", () => {
    // .view: every top-level state section (view-loading, view-disconnected, …)
    // .details: #detailsPanel ("Add details" panel)
    // .disclosure: #undoSaveBtn
    for (const selector of [".view", ".details", ".disclosure"]) {
      const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
      const ruleMatch = withoutComments.match(re);
      expect(ruleMatch, `expected a ${selector} rule in popup.css`).not.toBeNull();
      expect(ruleMatch![1]).toMatch(/display\s*:/);
    }
  });
});
