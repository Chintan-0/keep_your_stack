# Extension Popup State Machine — Final QA Report

## 1. Root cause

Two distinct, real bugs — both confirmed empirically in a real Chromium
engine, not assumed from code reading alone.

**Bug A (the reported symptom): a CSS specificity defect, not a JS/state
bug.** `popup.ts`'s `show(view)` was already a correct single-state
renderer: on every call it sets `hidden = id !== view` on *every* known
view, so at most one view is ever the "shown" one according to the DOM's
`hidden` property. The defect is in `popup.css`: `.view`, `.details`, and
`.disclosure` each declare their own `display: flex`. An attribute
selector (`[hidden]`) and a class selector (`.view`) have *equal* CSS
specificity (0,1,0). Per the cascade, when specificity ties, the *origin*
decides — and an **author** stylesheet always outranks the **user-agent**
stylesheet's built-in `[hidden] { display: none }` rule, regardless of
which rule appears "first". So every `<section class="view" hidden>` was
being rendered as a visible flex box the entire time, stacked in document
order — `hidden` was being silently ignored, not the JS logic.

Confirmed empirically (real Chromium, via the sandboxed browser tool):
```html
<style>.view { display: flex; }</style>
<section id="a" class="view" hidden>A</section>
<script>getComputedStyle(document.getElementById('a')).display</script>
<!-- returns "flex", not "none" -->
```

**Bug B (found while trying to verify Bug A's fix in an actual browser):**
`extension/tsconfig.json` used `moduleResolution: "node"` targeting
`module: "ES2020"`. For code that ships as **raw, unbundled ES modules
loaded directly by the browser** (this project's own explicit, stated
design — no bundler, no import map), that combination compiles relative
imports **without their file extension** (`from "../lib/api"`). A native
browser ES module loader — which a real Chrome extension's popup/
background/options pages use, with no bundler and no import map —
requires the *exact* specifier including its extension. Every one of
popup.js's six relative imports would 404 in real Chrome. This was never
caught because manual Chrome QA has never been available in this
environment (honestly disclosed in every phase since Phase 5), and
`tsc --noEmit` alone cannot detect a module-resolution/output-format
mismatch like this — it only checks types, not what a browser can
actually load.

## 2. Exact files changed

- `extension/popup.css` — the `[hidden]` fix
- `extension/tsconfig.json` — `module`/`moduleResolution: "NodeNext"`
- `extension/src/package.json` (new) — `{"type":"module"}`, scoped to
  `extension/src/` only (does not affect `extension/scripts/*.js`, which
  remain plain CommonJS Node build scripts)
- `extension/src/lib/api.ts` — `ConnectionStatus` classification
- `extension/src/lib/view-state.ts` — consumes `ConnectionStatus` directly
- `extension/src/lib/request-guard.ts` (new) — extracted stale-response guard
- `extension/src/popup/popup.ts` — wires the guard through startup;
  `.js` extensions added to its relative imports
- `extension/src/options/options.ts`, `extension/src/background/service-worker.ts`,
  `extension/src/lib/storage.ts`, `extension/src/lib/categories.ts` —
  `.js` extensions added to relative imports only (no logic changes)
- Tests: `extension/src/lib/popup-css-hidden.test.ts` (new),
  `extension/src/lib/request-guard.test.ts` (new),
  `extension/src/lib/view-state.test.ts` (expanded),
  `extension/src/lib/api.test.ts` (expanded)

**No changes** to the existing state machine's shape, the auth/refresh
flow, the Bearer-token contract, `/api/auth/refresh`, or any backend API
route. The architecture was not rewritten.

## 3. State machine implementation

Unchanged in structure — `show(view)`'s "set hidden on every view but
one" approach was already correct and is preserved exactly. What changed
is that the CSS now actually respects it. `resolveInitialView()` (already
the single authoritative decision point popup.ts consumes, per the
ticket's own §5–§7 goals) now takes a richer, more precise input.

## 4. Async/race-condition fix

Extracted the "is this still the latest attempt?" pattern into
`createSequenceGuard()` (`extension/src/lib/request-guard.ts`) — a tiny,
pure, directly unit-tested utility. `popup.ts`'s `init()` calls
`startupGuard.start()` and checks `startupGuard.isCurrent(requestId)`
immediately before every DOM-touching step (after `getActiveTab()`, after
`checkConnection()`, inside `checkDuplicateAndRender()`, and inside the
tail of `renderDuplicate()`/`renderNew()` after their own internal
stack/category fetches). A slower, superseded startup (e.g. the user
clicks Retry while the first attempt's connection check is still in
flight) can no longer render over a newer attempt's result. This is
scoped correctly to *within one popup document's lifetime* — Chrome tears
down the entire module (guard included) when the popup closes, so a
previous popup session's async work can never reach a new one; that
part of the "race" was already structurally impossible and didn't need a
guard.

## 5. Authentication behavior

Unchanged: `Authorization: Bearer <token>`, one automatic refresh-and-
retry on a 401 via `/api/auth/refresh`, session cleared and `AuthError`
thrown only when the refresh itself definitively fails. What's new is
that `checkConnection()` now **distinguishes** that definitive
`AuthError` (→ "expired") from a raw fetch failure (→ "network-error")
instead of collapsing both into the same `null`.

## 6. Error classification

New `ConnectionStatus` discriminated union in `api.ts`:
`{ status: "connected", email } | { status: "no-session" } | { status:
"expired" } | { status: "network-error" }`. `resolveInitialView()` maps
each to exactly one, distinct `ViewName` — `no-session → disconnected`,
`expired → expired`, `network-error → error`, `connected → check-duplicate`.
This directly fixes the gap the ticket called out at §10/§24: a signed-in
user whose network drops now correctly sees "Couldn't connect to
KeepYourStack", never "Session expired". The `hasEverConnected()`
heuristic this decision previously relied on is no longer needed for it
(the richer signal is precise); `hasEverConnected`/`markEverConnected`
themselves are untouched and still used for their original purpose
(`service-worker.ts`'s connect handler).

## 7. DOM rendering changes

None beyond the CSS fix. No `innerHTML +=`, no `appendChild` of a
top-level state, no independent component render was ever actually
present in `popup.ts` — `show()` was already the single render path the
ticket asks for. The fix is that the CSS now lets it work.

## 8. Tests added

- `request-guard.test.ts` (5) — first-token-is-current, Race C (an old
  attempt completing after a newer one started is no longer current),
  Race D (a reopened popup's fresh guard has no memory of a prior
  session), many out-of-order completions, and the "never current before
  `start()`" edge case (which this test suite itself caught as a real
  off-by-default bug in the first draft of the guard — fixed before
  committing).
- `popup-css-hidden.test.ts` (3) — regression-guards the actual CSS fix:
  asserts `popup.css` declares an authoritative `[hidden]` rule with
  `!important`, that it appears before the conflicting classes, and
  documents exactly which classes needed it.
- `view-state.test.ts` (expanded to 15) — every `ConnectionStatus`
  variant × `supportedUrl`, an explicit "every variant maps to a distinct
  outcome" exhaustiveness check, and the state-transition set from §29
  (checking→disconnected/expired/unsupported/ready/duplicate,
  error→checking, expired→checking).
- `api.test.ts` (+4) — `checkConnection`'s four classifications,
  including the exact network-error-vs-expired distinction from §10/§24.

## 9. Full test count

196 tests passing (17 files) — up from 174 before this fix.

## 10. Lint result

Clean (`npm run lint`).

## 11. Typecheck result

Clean — both the extension's own `tsc -p extension/tsconfig.json
--noEmit` and the root `tsc --noEmit -p tsconfig.json` (which also type-
checks the extension's `.test.ts` files under the web app's `bundler`
resolution mode).

## 12. Build result

Clean — `npm run build:extension` (now emitting proper `NodeNext` ESM
with `.js`-suffixed specifiers, verified by inspecting the compiled
output directly), `npm run build` (web app), and `npm run
package:extension` (the Chrome Web Store zip script, confirmed
unaffected — it lives outside `extension/src/` and stays CommonJS via
the repo root's own `package.json`).

## 13. Manual Chrome QA status

**Not performed** — no connected real Chrome browser is available in
this environment, unchanged from every prior phase's honest disclosure.

In its place, the fix was verified end-to-end in a real Chromium engine
(the sandboxed browser tool) by serving the actual compiled `dist/`
output alongside the real `popup.html`/`popup.css`, with `chrome.storage`,
`chrome.tabs`, and (for one scenario) `fetch` stubbed to realistic
values — not the extension sandbox itself, but the same browser engine
and the same compiled artifacts a real Chrome load would use. Three
scenarios were checked via `getComputedStyle` on every `.view` element:

| Scenario | Stub | Result |
|---|---|---|
| No stored session | empty storage | exactly one visible view: `view-disconnected` |
| Unsupported page | tab url `chrome://extensions` | exactly one visible view: `view-unsupported` |
| Valid session, network down | stored session + `fetch` rejecting | exactly one visible view: `view-error` ("Couldn't connect"), **not** `view-expired` |

All three confirmed exactly one `.view` element computed to a non-`none`
`display`, and the third specifically confirms the network-error/
session-expired classification fix. The temporary test harness (a
`public/popup-test/` folder under the web app, used only to serve the
static assets over `http://` so real ES modules could load — `file://`
does not execute a linked stylesheet or module script in this sandboxed
browser) was removed after verification; it was never committed.

## 14. Known limitations

- Real in-Chrome manual QA (§31's 20-step checklist) remains undone for
  the reason stated above. The compiled extension has not been loaded as
  an actual unpacked extension in a real Chrome window during this
  investigation.
- The outermost `showFatalError()` safety net (a truly last-resort catch
  for an unexpected synchronous throw during startup) is not gated by the
  sequence guard. This is intentional scope discipline, not an oversight:
  it's the rarely-triggered catch-all for a genuinely unexpected error
  (a missing DOM element, an unusual `chrome.*` rejection), and even in
  the rare case it fires from a superseded run, it still only ever shows
  one state (`view-error`) — it cannot violate the single-state guarantee
  this bug is about.
- Race scenarios A and B from §30 (slow session check vs. fast tab
  detection; slow duplicate check vs. a failing connection check) are
  covered by code inspection and the `resolveInitialView` exhaustiveness
  tests, but not simulated as literal timed `chrome.*`/`fetch` mocks —
  doing so would require introducing DOM/chrome-API mocking
  infrastructure (jsdom + fake timers wired to real `chrome.tabs`/
  `chrome.storage` call sequencing) that doesn't exist anywhere in this
  project's test suite today, and building it was judged out of scope for
  this fix given the ticket's own "do not rewrite the extension
  architecture unnecessarily" instruction.
