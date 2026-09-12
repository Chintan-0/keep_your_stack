import { describe, it, expect } from "vitest";
import { createSequenceGuard } from "./request-guard";

describe("createSequenceGuard", () => {
  it("the first started token is current", () => {
    const guard = createSequenceGuard();
    const a = guard.start();
    expect(guard.isCurrent(a)).toBe(true);
  });

  it("Race C: an old attempt completing after a newer one started is no longer current", () => {
    // e.g. "error → retry" (§17): the failed attempt's request must not
    // resurrect itself after Retry has already started a new one.
    const guard = createSequenceGuard();
    const first = guard.start();
    const second = guard.start();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("Race D: reopening the popup starts a brand new guard where nothing is current until it starts its own attempt", () => {
    // Chrome tears down the whole popup document — and every module-level
    // variable in it, including a previous popup.ts instance's
    // `startupGuard` closure — on close. A reopened popup's `init()`
    // constructs (implicitly, via the module re-evaluating) a *new*
    // createSequenceGuard() with its own private `current`; there is no
    // code path by which an old session's token value could even be
    // passed into the new one's isCurrent(). What the new instance must
    // still get right on its own is the same "before start()" guarantee:
    // nothing reads as current until it explicitly starts an attempt.
    const reopenedPopup = createSequenceGuard();
    expect(reopenedPopup.isCurrent(0)).toBe(false);
    const token = reopenedPopup.start();
    expect(reopenedPopup.isCurrent(token)).toBe(true);
  });

  it("supports many out-of-order completions: only the most recently started token is ever current", () => {
    const guard = createSequenceGuard();
    const tokens = Array.from({ length: 5 }, () => guard.start());
    tokens.forEach((t, i) => {
      expect(guard.isCurrent(t)).toBe(i === tokens.length - 1);
    });
  });

  it("a token is never current before its own attempt has started", () => {
    const guard = createSequenceGuard();
    // start() returns 0 for its first call — but a *fresh* guard (before
    // start() is ever called) must not treat 0 as already current, or a
    // stray/uninitialized token value could be mistaken for a real one.
    expect(guard.isCurrent(0)).toBe(false);
  });
});
