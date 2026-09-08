# KeepYourStack — Chrome Extension

A Manifest V3 extension that saves the page you're viewing to your real
KeepYourStack account in one click. It is **not** a bookmark manager and
does **not** sync your existing Chrome bookmarks automatically — for that,
use the web app's [Import Bookmarks](../src/app/(app)/import/page.tsx) flow
instead. See the root `README.md` for the web app itself; this file only
covers the extension.

**Ways to save:**
- Click the toolbar icon → **Save to KeepYourStack** (Stack/Category/Tags/
  Note behind "Add details" — never required)
- Right-click a page → **Save to KeepYourStack**
- Right-click a link → **Save link to KeepYourStack** (saves the link's own
  target, never the page it's on)
- Keyboard shortcut, default `Ctrl+Shift+K` / `Cmd+Shift+K` (Chrome may
  reassign this if another extension already claims it — check
  `chrome://extensions/shortcuts` if it doesn't fire)

The popup's own "Saved ✓" is the only feedback for a popup save; the
context-menu and keyboard-shortcut paths use a Chrome notification instead
(toggle it off in Options if you'd rather stay quiet). A small "Recently
Saved" list in the popup (title + when, click to open) is a convenience
only — the web app's library remains the one real record.

## 1. Building it

From the repo root (the extension shares the root `node_modules` —
`@types/chrome` is a root devDependency):

```bash
npm run build:extension
```

This compiles `extension/src/**/*.ts` to `extension/dist/` with `tsc`. No
bundler, no npm packages inside the compiled output — every file is a
dependency-free ES module, loaded by the browser directly.

## 2. Loading it into Chrome

1. `npm run build:extension`
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select this `extension/` folder (not `dist/`
   — the manifest lives at the extension root and references `dist/*.js`)
5. Pin the KeepYourStack icon if you'd like it visible in the toolbar

Re-run `npm run build:extension` after any source change, then click the
refresh icon on the extension's card in `chrome://extensions` to pick it up
(Chrome does not hot-reload unpacked extensions).

## 3. How authentication works

The extension does **not** implement a second login system, and never
touches your Supabase service-role key or any other privileged credential —
only your own short-lived, refreshable session, the same kind the web app
itself holds.

1. You sign in to the KeepYourStack **web app** normally (email/password,
   same as always) — that's a cookie session, as before.
2. On the web app's `/extension` page, clicking **Connect Extension**
   reads your *own already-active* Supabase session client-side
   (`supabase.auth.getSession()` — no new API call, no new credential) and
   dispatches a `keepyourstack:connect` DOM event carrying its access +
   refresh tokens.
3. A content script (`extension/src/content/bridge.ts`) — injected **only**
   on the KeepYourStack app's own origin, nowhere else — relays that one
   event to the extension's background service worker.
4. The service worker stores the session in `chrome.storage.local` (local
   to this browser profile; never leaves the device except to `fetch` your
   own API with it) and acks back to the page, which is the only thing that
   flips the page's status to "Extension connected" — it's a real
   confirmation, not an assumption.
5. Every subsequent extension → backend request sends
   `Authorization: Bearer <access_token>` instead of a cookie (the
   extension's origin, `chrome-extension://...`, doesn't share the web
   app's cookie jar). `src/lib/data/auth.ts`'s `requireUser()` accepts
   either — cookie *or* bearer token — and RLS still scopes every query to
   that same user either way. No bypass, no elevated privilege.
6. If a request 401s, the extension calls `POST /api/auth/refresh` once
   with its refresh token to get a new access token and retries — see
   `extension/src/lib/api.ts`. If that also fails, the stored session is
   cleared and the popup shows **"Your KeepYourStack session has
   expired."**

Disconnecting (Settings → Disconnect in the extension's options page)
simply clears `chrome.storage.local` — it does not touch your account.

## 4. How it talks to `/api/resources`

The extension is a second **client** of the exact same backend contract
the web app uses — it does not duplicate any business logic:

| Extension action | Endpoint | Notes |
|---|---|---|
| Check connection | `GET /api/account` | "who am I" — 401 means not connected/expired |
| Check for a duplicate | `GET /api/resources?url=...` | Same `normalizeUrl`/lookup the web app's own duplicate check uses; the full resource (including `isArchived`/`categoryId`) comes back so the popup can offer Restore/"already in Archive" |
| List stacks (for the optional dropdown) | `GET /api/stacks` | Read-only from the extension — it can't create stacks |
| List categories (for the optional dropdown) | `GET /api/categories` | Same dynamic per-user tree the web app uses — no second taxonomy in the extension |
| Save a page | `POST /api/resources` | Identical body shape to the web app's `addResource`; `force: true` is the explicit "Save Anyway" path past a duplicate |
| Restore an archived duplicate | `PATCH /api/resources/:id` (`isArchived: false`) | Only reachable from the "Already saved in Archive" duplicate view |
| Undo a just-made save | `DELETE /api/resources/:id` | Only ever called on a resource this popup session itself just created |
| Trigger enrichment after a save | `POST /api/resources/:id/enrich` | Fire-and-await, never blocks the save; gated by the "auto-enrich" option |
| Refresh an expired token | `POST /api/auth/refresh` | Extension-only; wraps `supabase.auth.refreshSession` |

All of these got a small, backward-compatible addition on top of their
existing (cookie-only, same-origin) behavior:
`src/lib/cors.ts` adds CORS headers scoped to real `chrome-extension://`
origins, and `requireUser()` accepts a Bearer token as an alternative to
the cookie session. Nothing about the web app's own requests changed.

`GET /api/resources?url=` is the one net-new capability (previously only a
full list existed) — needed so the popup can ask "is this page already
saved?" without pulling the user's entire library over the wire.

URL normalization for duplicate detection lives in exactly one place
conceptually — `src/lib/utils.ts`'s `normalizeUrl` — but is *duplicated* in
`extension/src/lib/url.ts` because the extension can't resolve
`clsx`/`tailwind-merge` (bare npm imports) as a browser ES module without a
bundler. `extension/src/lib/url.test.ts` asserts both copies agree on the
same inputs on every test run, so drift between them fails CI rather than
silently causing a mismatched duplicate.

## 5. Required configuration

No environment variables are baked into the extension at build time — it
never needs to know your Supabase URL or anon key. The only thing it needs
is which KeepYourStack deployment to talk to, which is a **runtime**
setting (extension Options page → "KeepYourStack app URL"), defaulting to
`http://localhost:3000`.

That origin must also be listed in `manifest.json`'s `host_permissions` and
`content_scripts.matches` for both the API `fetch()` calls and the
Connect-Extension bridge to work — Chrome doesn't grant cross-origin fetch
or injection to an origin the manifest didn't declare. `localhost:3000` and
`127.0.0.1:3000` are declared for local development.

**To point a build at a production deployment**, set `EXTENSION_APP_ORIGINS`
(reusing the project's existing environment-variable convention — the same
way `NEXT_PUBLIC_SUPABASE_URL` configures the web app) before building:

```bash
EXTENSION_APP_ORIGINS=https://app.keepyourstack.example npm run build:extension
```

`npm run build:extension` runs `extension/scripts/generate-manifest.js`
first, which rewrites `manifest.json`'s `host_permissions` and
`content_scripts.matches` to exactly that origin (comma-separate a list —
e.g. `https://app.keepyourstack.example,http://localhost:3000` — to support
both at once), then compiles as usual. Leaving the variable unset keeps the
local-dev defaults. This only ever accepts a bare origin (`https://host`,
no path, validated before anything is written) — there is no path through
it for a secret or credential to end up in the built manifest, and nothing
else about the extension's permissions changes.

After changing it, reload the unpacked extension in `chrome://extensions`
(Chrome doesn't pick up a manifest change until you do) — this is a
deliberate manual step (see §34 of the Phase 5 spec — minimal permissions,
no broad host access, no permission the extension requests automatically
without you choosing to rebuild for that origin).

## 6. Testing locally

Automated:

```bash
npm test          # includes extension/src/**/*.test.ts (url, api, view-state logic)
npm run lint       # extension/dist and extension/scripts are build output/tooling, excluded
npx tsc --noEmit -p tsconfig.json      # web app + extension/src (extension's own tests only, via the shared root tsconfig)
npm run build:extension                # extension/tsconfig.json — compiles the shipped extension itself
```

Manual: see §7 below for the full real-Chrome checklist and its current
(unrun) status.

## 7. Manual QA checklist (real Chrome — not yet run by an agent)

Everything below needs an actual Chrome window with the unpacked extension
loaded. As of Phase 10, no agent session in this environment has had a
connected real Chrome browser available (`list_connected_browsers` /
equivalent came back empty) — the backend contract, auth bridge mechanics,
CORS, and URL-normalization/duplicate-detection logic have all been
verified live against local Supabase by replaying the extension's exact
HTTP calls (see the Phase 5, 5.1, and 10 final reports), and 170+ automated
tests cover the pure logic, but **the literal in-Chrome click-through below
has not been performed by an agent.** Run it once through before trusting
the extension in daily use, and update this note (or delete it) once you
have:

- [ ] Load unpacked in `chrome://extensions` — no manifest/service-worker
      errors shown on the extension's card
- [ ] Click the toolbar icon on a real site (e.g. react.dev) — title, URL,
      and favicon appear correctly
- [ ] Sign into the web app, go to `/extension`, click **Connect
      Extension** — popup then shows the connected state (not "Connect
      KeepYourStack") without manually copying any token
- [ ] Save the current page — loading state, then "Saved to
      KeepYourStack ✓"; the Save button can't be double-clicked into a
      double submission
- [ ] Reopen the same page — popup shows "Already saved", not the save
      form; confirm in the web app only one resource exists
- [ ] Save with Useful For + Stack + Category + Tags + Note filled in — all
      five persist and are visible/searchable in the web app after a
      refresh
- [ ] Archive a saved resource in the web app, then reopen its page in the
      extension — popup shows "Already saved in Archive" with a working
      Restore action
- [ ] On an "Already saved" page, click "Save anyway" — a second, separate
      resource is created (confirm in the web app)
- [ ] Undo a fresh save from the success view — the resource disappears
      from the web app and from the popup's Recently Saved list
- [ ] Right-click → **Save to KeepYourStack** on a page — a Chrome
      notification confirms save or duplicate
- [ ] Right-click a link (not the page background) → **Save link to
      KeepYourStack** — the *link's* URL is saved, not the page you were
      on; confirm in the web app
- [ ] Press the keyboard shortcut (`chrome://extensions/shortcuts` to see
      or change it) on a supported page — same save-or-duplicate
      notification as the context menu, no popup opened
- [ ] Visit `chrome://extensions`, `chrome://settings`, or `about:blank`
      and open the popup — "This page can't be saved to KeepYourStack.",
      no network request attempted, no crash; same page via the context
      menu shows "Can't save this page" notification instead
- [ ] Stop the dev server, attempt a save — clear error + working Retry,
      no raw stack trace; start the server back up and confirm Retry
      succeeds
- [ ] Sign out of the web app, then try to save from the extension — it
      should show the expired/disconnected state rather than continuing to
      save (the sign-out call revokes the session server-side; see the
      Phase 5.1 report for the API-level proof of that revocation)
- [ ] Set a default Stack and Category in Options — a fresh popup save
      pre-selects both without forcing them (still changeable per save)
- [ ] Turn off "auto-enrich" and "save notification" in Options, then
      save from the context menu — no enrichment call fires, no
      notification appears, and the resource still saves correctly
- [ ] Open two tabs on different sites, open the popup on tab A, close it
      without saving, then open the popup on tab B — shows tab B's title/
      URL, never tab A's stale data
- [ ] Click Save, then immediately try clicking it again before the
      "Saved ✓" view appears — only one resource is created (the button/
      view swap prevents a double submission)
- [ ] Open the Chrome DevTools console for the popup and the service
      worker (`chrome://extensions` → "service worker" link) — no
      uncaught exceptions, no CORS errors, no undefined `chrome.*` calls

## 8. Packaging for later Chrome Web Store submission

Not done in this phase (see §34/§36 of the Phase 5 spec — explicitly out of
scope). When it's time:

```bash
npm run package:extension   # builds dist/ then writes extension/keepyourstack-extension.zip
```

Before actually submitting: swap `host_permissions`/`content_scripts` to
the real production origin (not `localhost`), bump `manifest.json`'s
`version`, and review permissions once more — the manifest currently
requests only `activeTab`, `contextMenus`, `storage`, and `notifications`,
plus `commands` (for the keyboard shortcut — declarative, not a
permission) and host permissions for the app's own origin; no
`bookmarks`, `tabs`, or `<all_urls>`. The keyboard shortcut and both
context-menu items reuse `activeTab`'s existing grant (Chrome extends it to
the tab active at the moment of a context-menu click or a declared
`commands` shortcut, the same as a toolbar-icon click) — no extra
permission was needed for either.
