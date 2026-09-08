# Phase 5.2 — Resource Enrichment: Final Report

Implementation was completed and committed in an earlier session. This report
documents live manual verification of the system against local Supabase,
performed after the fact, and the Phase 4/5 extension-facing endpoints it
shares infrastructure with.

## What the system does

- **Client-side, at Add Resource time** (`src/components/add-resource-modal.tsx`):
  pastes a URL → `POST /api/metadata` (SSRF-guarded fetch) → real
  title/description/favicon/image from the page's own `<title>`/meta tags →
  `suggestUsefulFor`/`suggestTags`/`suggestCategoryForResource`
  (`src/lib/enrichment.ts`) derive suggestions from that real evidence only,
  pre-filled but always editable/removable before Save.
- **Server-side, "Phase B" enrichment** (`src/lib/data/enrichment.ts`,
  `POST /api/resources/:id/enrich`): a fast title+URL save (import, or the
  extension) gets description/Useful For/tags/category filled in afterward,
  deterministically — no AI, no invention. A resource whose page can't be
  reached is marked `enrichmentStatus: "failed"` with nothing invented,
  never a fabricated description.
- **Provenance**: `descriptionSource`/`usefulForSource` (`"system" | "user" |
  null`) ensure a manual edit is never silently overwritten by a later
  enrichment pass — `updateResource()` always marks a human edit as `"user"`;
  only `enrichResource()` itself ever writes `"system"`. Tags are pure
  set-union (add-only) so automation can never remove a user-created tag.
  Category is only filled when currently unset and the match is
  high-confidence (import folder name or an exact existing-category
  mention) — never overwritten, never guessed.
- **Needs Review**: `needsReview()` (`src/lib/utils.ts`) flags a resource
  with no category and no Useful For (extended in Phase 9 to also flag a
  broken/blocked link) — one unified queue, not per-field alerts.

## Live verification performed

Local Supabase (`supabase_db_keepyourstack-app`, confirmed healthy), dev
user `dev@keepyourstack.local` (recreated via `scripts/create-dev-user.mjs`
— was already present), dev server on `:3000`, driven both through the
actual browser UI and via direct API calls mirroring exactly what the UI
itself sends.

1. **Add Resource with a real reachable URL** — `https://react.dev`: real
   fetch returned title "React" and a real description; `suggestUsefulFor`
   pre-filled "Build React interfaces" from that evidence. `https://vitejs.dev`:
   real description "Next Generation Frontend Tooling" fetched; no Useful
   For/tags/category were suggested (correctly — low-confidence, nothing
   invented to fill the gap). Saved Vite; confirmed via API it persisted
   with `descriptionSource: "user"` (a human had the chance to review it
   before Save) and `enrichmentStatus: "enriched"`.
2. **Import + Phase B enrichment**, mirroring the import page's own
   `POST /api/import` → `POST /api/resources/:id/enrich` per created
   resource sequence: imported Postman, Docker, and a deliberately
   nonexistent domain (`this-domain-should-not-exist-phase52-fixture-xyz.com`)
   as fast title+URL saves (`enrichmentStatus: "pending"`). After
   enrichment: Postman and Docker got real fetched descriptions/tags (one
   also got a real Useful For), both `"system"`-sourced; the unreachable
   domain came back `enrichmentStatus: "failed"` with an empty description,
   no tags, no useCases — confirmed nothing was invented for a URL that
   couldn't be reached.
3. **Manual edit survives re-enrichment**: hand-edited Postman's
   description and Useful For via `PATCH` (→ `descriptionSource`/
   `usefulForSource: "user"`), then called the enrich endpoint again (the
   same "Retry enrichment" a human would trigger). The manual text came
   back completely untouched on both fields — confirmed provenance
   protection works, not just at write time but through a real subsequent
   enrichment pass.
4. **Needs Review filter** (`/resources?needsReview=1`): correctly showed
   only the unreachable "Broken Tool Link" (enrichment failed, no metadata)
   and "Vite" (has a description but no category/Useful For) — Postman and
   Docker, which got real metadata from enrichment, were correctly excluded.
5. **Resource Detail retry-enrichment panel**: visually confirmed the
   "This resource needs a little more context / We couldn't get more
   details from this site" panel with a working **Retry enrichment**
   button, rendering cleanly alongside the Phase 9 link-health section
   above it. Clicked Retry on the unreachable resource — confirmed via API
   that `enrichmentAttempts` incremented (1 → 2) and the status honestly
   stayed `"failed"` rather than faking success.
6. **Phase 4/5 extension-facing endpoints**, via `curl` with a real bearer
   token (signed in as the dev user through local GoTrue's password grant —
   the same short-lived access token the extension's auth bridge hands
   over) and a `chrome-extension://` `Origin` header:
   - `GET /api/account` → 200, correct user identity
   - `GET /api/resources?url=...` → 200, `{"resource":null}` for an
     unsaved URL
   - `POST /api/resources` → 201, resource created
   - `POST /api/resources/:id/enrich` → 200, ran the same deterministic
     pipeline as every other capture path
   - Confirmed `GET /api/account` **without** a bearer token correctly
     returns `401 Unauthorized` — auth is enforced, not just present when
     convenient.

All test data (5 resources from the UI/import tests, 1 from the curl
endpoint tests) was deleted afterward — the dev account was returned to 0
resources, confirmed via API. Scratchpad token files and the bookmark
fixture were removed.

## Findings

No enrichment-system defects were found. Everything behaved exactly as
designed: real evidence only, no invention on failure, provenance
protecting manual edits through repeated retries, and the extension-facing
endpoints all correctly bearer-token-authenticated with CORS scoped to a
real extension origin.

(Separately, in the same session, a genuine bug was found and fixed in
`createResource`'s `force`/"Save Anyway" path — unrelated to the
enrichment pipeline itself. See the Phase 10 report.)

## Known limitations

- Verification used the sandboxed preview browser and direct `curl`/`fetch`
  calls, not a real Chrome browser with the extension loaded — no
  connected Chrome instance is available in this environment (same
  limitation noted in the Phase 5/5.1/10 reports).
- `suggestTags`/`suggestUsefulFor`/`suggestCategoryForResource` remain
  purely deterministic (keyword/domain heuristics) — no semantic
  understanding, by design (Phase 7/8 would be where AI-based enrichment
  is considered, and neither has been started).
