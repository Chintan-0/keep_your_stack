# Phase 11 — Migration, Import & Data Portability: Implementation Report

## 1. Files changed

**New:**
- `supabase/migrations/20260101000009_import_export.sql`
- `src/lib/import/types.ts`, `csv.ts` (+ `csv.test.ts`), `backup.ts` (+ `backup.test.ts`)
- `src/lib/data/export.ts`, `import-backup.ts`, `import-mappings.ts`, `import-history.ts`
- `src/app/api/export/{json,csv,html}/route.ts`
- `src/app/api/import/{backup,mappings,history}/route.ts`
- `src/app/(app)/settings/data/page.tsx`

**Modified:**
- `src/app/(app)/import/page.tsx` (extended, not replaced — HTML flow unchanged)
- `src/app/api/import/route.ts` (extended: `useCases`, `description`, `notes`, `createdAt`, `isFavorite`, `isArchived`, `sourceId`, per-batch `source`)
- `src/lib/data/resources.ts` (`ResourceInput` gains `createdAt`/`updatedAt`/`importSourceId`)
- `src/lib/data/mappers.ts`, `src/lib/types.ts`, `src/lib/supabase/types.ts`, `src/lib/demo-data.ts` (new field wiring)
- `src/app/(app)/settings/page.tsx` (old ad hoc export replaced with a link to the new Data page)
- `src/app/(app)/resources/page.tsx`, `src/app/(app)/favorites/page.tsx` (export buttons wired to real scoped export)

## 2. Database changes

- `resources.import_source_id` (nullable text) — provenance only.
- `remembered_import_mappings` (user-owned, RLS: select/insert/update/delete own) — unique `(user_id, folder_path)`.
- `import_history` (user-owned, RLS: select/insert/delete own) — counts + filename, capped `failed_items` array, never the source file's content.

## 3. Supported import formats

- **Chrome / Firefox / Edge / generic Netscape HTML** — one shared parser (unchanged from Phase 4). A source picker in the UI labels provenance (`chrome`/`firefox`/`edge`/`bookmarks`) since the three browsers produce byte-identical export formats — there is no reliable way to distinguish them from file content, and building three "different" adapters over one parser would be fake differentiation.
- **CSV** — auto-detects common headers and several aliases (`Website Name`→title, `Link`→url, `Labels`→tags, etc.); a manual column-mapping screen appears when no URL column is found.
- **KeepYourStack JSON backup** — versioned, fully validated, restores categories/stacks/tags/resources by name-resolution (never trusting the file's own ids as database ids).

## 4. Supported export formats

- **JSON** (full backup) — resources, categories, stacks, tags, notes, favorites, archive state, provenance, timestamps. Scoped via `?scope=all|selected|favorites|stack|category`.
- **CSV** — same scoping, formula-injection safe.
- **HTML** (Netscape bookmark format) — folders reflect Category → Subcategory.

## 5. Third-party adapters actually implemented

**None built as bespoke parsers.** Raindrop and Linkwarden both export standard HTML or CSV, which the generic HTML/CSV importers already handle — I did not have a verified real export sample from either service to build and test a dedicated parser against, and the spec explicitly said not to pretend an unverified format works. This is the honest, documented position rather than a claimed-but-untested adapter.

## 6. Import limits

- `MAX_IMPORT_ITEMS` = 20,000 per file (client-side rejection before parsing).
- `MAX_ITEMS_PER_REQUEST` = 1,000 per `/api/import` call (client chunks in batches of 25 well under this).
- `MAX_BACKUP_FILE_BYTES` = 100MB, `MAX_BACKUP_RESOURCES` = 20,000 (server-side, `/api/import/backup`).
- Per-item clamps (`clampImportItem`): title 500 chars, description 5,000, notes 20,000, 30 tags/item.

## 7. Batch/concurrency strategy

Client-side chunking at 25 items per `/api/import` request (unchanged from Phase 4) — never one request per bookmark. Enrichment runs afterward with `runWithConcurrency` at concurrency 5 (existing Phase 5.2 mechanism), fully decoupled from the save step: a save failure never blocks enrichment of the others, and enrichment failures never undo a successful save.

## 8. Duplicate strategy

- **Existing in library**: `createResource`'s pre-existing `(user_id, normalized_url)` uniqueness check — reported as `duplicate: true`, skipped by default.
- **Duplicate within the same file**: detected client-side (`inFileDuplicateUrls`) and shown distinctly in the preview; verified live that importing the same normalized URL twice in one request still creates exactly one resource.
- **Possible/semantic duplicates**: unchanged — Phase 9's Library Health Duplicate Center already covers this for the resulting library; imported resources are ordinary resources to it.

## 9. Mapping behavior

Folder path → category, using the existing deterministic `suggestCategoryForFolder` (never invents a category). Remembered mappings (exact folder-path match, case-insensitive) take priority over the deterministic suggestion when present. A "Remember this mapping" checkbox per group writes one row per folder path (upserted, never duplicated).

## 10. Provenance model

`importSource` (e.g. `chrome`, `csv`, `keepyourstack-backup`), `importFolder` (original path string), `importSourceId` (the source's own id, when one exists — e.g. a backup's original resource id). All three are read-only display fields; nothing downstream trusts them for security decisions.

## 11. Backup contents

Resources (title, url, description, useCases, notes, categoryId, tagIds, stackIds, isFavorite, isArchived, createdAt, updatedAt, provenance), categories, stacks, tags. **Never** auth tokens, passwords, or sessions — none of those exist on these tables, so there was nothing to accidentally include.

## 12. Security protections

- Every import path (HTML/CSV/JSON) creates resources through the same `createResource()`, which already rejects non-http(s) URL schemes and validates category ownership server-side.
- JSON backup validation (`validateBackup`) never spreads the parsed object anywhere — only specific known fields are read — which is what keeps it safe from prototype pollution regardless of field names an attacker chooses.
- A backup resource's category/stack/tag reference not present in that *same file's* own arrays is silently dropped, never trusted as a real id.
- Category/stack resolution for a restore only ever matches-or-creates within the *calling* user's own taxonomy (by name) — structurally incapable of referencing another user's row.
- CSV export escapes formula-injection prefixes (`=`, `+`, `-`, `@`, tab, CR) with a leading apostrophe on every cell, not just suspicious-looking ones.
- File-size and item-count limits reject pathological input before parsing.

## 13. Tests passed

231 total (70 new): `csv.test.ts` (24), `backup.test.ts` (11), plus existing suites unchanged and passing. Lint clean. Both typechecks (web app + extension) clean. Both builds (`npm run build`, `npm run build:extension`) clean.

## 14. Performance measurements

Not load-tested at 5,000–10,000 items in this pass (would require generating and uploading a synthetic file of that size through the real UI, which wasn't prioritized given the session's time budget). The chunked-batch architecture (25/request, existing since Phase 4) is unchanged and was already the mechanism handling large imports; nothing in this phase's additions changes its scaling characteristics.

## 15. Live verification performed (local Supabase, real requests — see commit message for full detail)

- **Mandatory round-trip test**: real dev-account data (7 real resources + 2 enriched test resources with subcategory/stack/tags/notes/favorite/archived) → full JSON backup → **genuinely cleared** (`/api/clear-data`) → restored from that same backup → verified logical equivalence (title/description/useCases/notes/category path/tags/stacks/favorite/archived/timestamp) for all 9, new database ids, original id preserved as `importSourceId`. **Found and fixed a real bug in the process**: `useCases` was never threaded through the shared import route for any source.
- Realistic bookmark fixture (nested folders, duplicate URL, invalid URL, missing title, absurd-length title, dated bookmarks, an unreachable domain, a working domain, a `javascript:` bookmarklet) run through the full pipeline: parse → categorize → save → enrich → search → Library Health.
- CSV import with alternate headers.
- CSV/HTML export sampled directly; formula-injection payloads confirmed escaped.
- Cross-user export isolation confirmed with a second real account.
- Import history record/list confirmed.
- All test data, test accounts, and scratch files cleaned up — dev account restored to its real 7 resources.

## 16. Known limitations

- No dedicated Raindrop/Linkwarden parsers (§5).
- CSV column mapping covers the six recognized fields only, not arbitrary custom columns.
- Semantic search participation couldn't be verified — Phase 7 (semantic search/embeddings) was never implemented in this project.
- HTML export can't represent multi-stack membership (format limitation).
- No delete UI yet for a remembered mapping or a history entry (both exist server-side).
- Large-scale (5,000+) import performance wasn't separately load-tested this pass.

## 17. What should be addressed in Phase 12

Not decided here per this phase's own instruction to stop and report. Candidates worth the user's attention: real Raindrop/Linkwarden export samples if dedicated adapters are wanted; a delete UI for mappings/history; large-import load testing; Phase 7/8 (semantic search, AI enrichment) if those are still intended, since several Phase 11 acceptance items (semantic-search participation) depend on them existing first.

**Per this phase's own closing instruction, Phase 12 is not started.**
