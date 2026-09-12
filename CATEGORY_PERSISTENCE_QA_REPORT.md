# Category Persistence Bug — Final QA Report

## 1. Root cause

There was **no data-persistence bug** in the write path. Every layer —
database schema, RLS, `createCategory`/`renameCategory`/`moveCategory`,
`createResource`/`updateResource`, and all four resource-mutating API
routes (create, edit, Move, bulk move, import) — correctly persists
`category_id` (category-only or a subcategory leaf) and never silently
drops it to `null`. This was confirmed both by full static code review
(§1 below) and by live reproduction of every scenario in the bug report
against the real dev account and local Supabase, with request/response
evidence for each.

The **real, reproducible bug** is a UI layout defect: `CategorySelector`
can render up to two side-by-side controls — a category dropdown +
subcategory dropdown, or the inline "create subcategory" name input with
its own 36px Create/Cancel icon buttons. Both the Add Resource and Edit
Resource modals squeezed this into a `grid-cols-2` cell shared with Tags
(roughly half the modal's width). In that half-width cell, the
create-subcategory input's text and its Create button visually
overflowed into the Tags field sitting right next to it. The underlying
value was always correct — submitting the real DOM element (bypassing
the cramped click target) worked and persisted correctly every time —
but the Create button became small and easy to miss or mis-click, which
is exactly what a real user experiences as "creating a subcategory
doesn't work" or "the category disappeared." The Move Resource modal,
which never puts `CategorySelector` in a shared half-width grid cell,
never exhibited this problem — a genuine, useful data point during
investigation.

## 2. Exact files changed

- `src/components/add-resource-modal.tsx`
- `src/components/edit-resource-modal.tsx`

Both changes are layout-only: Category now gets its own full-width row
instead of sharing a `grid-cols-2` cell with Tags (which now also gets
its own full-width row below it), matching how the Move Resource modal
already displayed it. No logic changed in either file.

## 3. API changes

None. `POST/GET /api/categories`, `PATCH/DELETE /api/categories/:id`,
`POST /api/resources`, `PATCH /api/resources/:id`,
`POST /api/resources/bulk-move`, and `POST /api/import` were all
inspected and are unchanged.

## 4. Database changes

None. Schema (`categories.id/user_id/parent_id/name/sort_order`,
`resources.category_id`) is unchanged. Confirmed: `resources` has a
single `category_id` column, not a separate `category_id`/`subcategory_id`
pair — a subcategory assignment is simply `category_id` pointing at a
leaf row (`parent_id` set); this is the existing, correct architecture
and was not touched.

## 5. RLS changes

None — and none were needed. Verified live with a second real test user:

- User B's own `GET /api/categories` never includes User A's categories.
- User B creating a resource with User A's category id → rejected:
  `{"error":"That category doesn't exist."}` (400/500, not silently
  ignored).
- User B renaming or deleting User A's category id → rejected:
  `{"error":"Category not found."}`.
- User A's category confirmed untouched afterward.

## 6. Frontend state changes

None beyond the JSX layout fix described above. Zustand's `categories`
state, `addCategory`'s use of the server's real returned id (never a
temporary frontend-only id), and `CategorySelector`'s controlled
`value`/`onChange` contract were all inspected and are correct as-is —
per the task's own instruction, this was **not** rewritten.

## 7. Category creation behavior (verified live)

- Root category (`POST /api/categories` with no `parentId`) → real UUID
  returned, persisted, immediately visible.
- Subcategory (`parentId` set) → persisted with the correct `parent_id`,
  immediately visible and selectable.
- A newly created category is used by its **real returned id** the
  moment `addCategory()` resolves — no temporary id, no race with a
  background refetch.

## 8. Resource assignment behavior (verified live, real dev account, full page reloads between checks)

| Scenario | Result |
|---|---|
| Assign existing category (Development) | Persisted; survived reload, Resource Detail, Edit re-open |
| Assign existing subcategory (Development → Frontend) | Persisted; survived reload |
| Create new category, immediately assign, save, reload | Persisted (`category_id` = the new category's real id) |
| Create new subcategory, immediately assign, save, reload | Persisted (`category_id` = the new subcategory's real id) |
| Category-only (no subcategory) | Persists as `category_id = <category>`, **never** both-null |
| Subcategory → category-only ("remove subcategory") | Persists as `category_id = <parent>` |
| Bulk move, category-only | Both resources persisted with `category_id = <category>` |
| Import with a category selected | Persisted (`category_id` set), survived a fresh fetch |
| Cross-user category id | Rejected server-side, RLS-enforced |

## 9. Tests added

None. The fix is a JSX/CSS layout change with no new logic to unit-test.
This project's own established convention, consistent across every prior
phase, is that server-only/DB-dependent behavior (exactly what this bug
report is about) is verified live against a real local Supabase instance
rather than mocked in Vitest — introducing a mocked-DB or component-DOM
testing paradigm here would be inconsistent with that convention and
this repo's `vitest.config.ts` (`environment: "node"`, no jsdom/Testing
Library). The live verification in §8 above, performed with real
UUIDs and real HTTP responses, is the regression evidence for this fix,
matching how every previous phase in this project's history has verified
this class of behavior.

## 10. Full test count

174 tests passing (15 files) — unchanged by this fix.

## 11. Lint result

Clean (`npm run lint`), no warnings or errors.

## 12. Typecheck result

Clean (`npx tsc --noEmit -p tsconfig.json`), no errors.

## 13. Build result

Clean (`npm run build`) — production build succeeds, all routes compile.

## 14. Remaining limitations

- The category management page (`/settings/categories`) — create,
  rename, reorder, delete, reassign — was inspected via code review only
  in this pass, not re-driven live end-to-end (it uses the same
  `createCategory`/`renameCategory`/`reorderCategory`/`deleteCategory`
  data-layer functions already verified live via other flows in this
  investigation, and was fully live-tested along with everything else in
  the original Phase 6/dynamic-categories work).
- No automated regression test guards specifically against a
  *future* re-introduction of the layout overlap (e.g. a visual
  regression test) — this project has no visual-testing infrastructure,
  and adding one was out of scope for this fix.
