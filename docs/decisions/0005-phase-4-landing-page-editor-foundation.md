# 0005 — Phase 4 landing page editor foundation

## Status
Accepted

## Context
Phase 3's `LandingPage.config` was an intentionally opaque JSON bag (`{ version: 1, sections:
[{ id, type: string, props: Record<string, unknown> }] }`) with zero section-type validation —
adequate for proving the CRUD/tenant-isolation domain layer, but not something a visual editor,
a deterministic renderer, or future AI generation could safely build on. Phase 4's job is to
replace that opaque shape with a canonical, versioned, typed document and ship the first working
editor against it.

## Decisions

- **Canonical schema lives in `shared/`, schemaVersion bumped to 2:** `shared/src/schemas/pageDocument.schema.ts`
  is the single source of truth for "what a valid page document looks like" — used by server
  validation, the client editor, and the renderer alike (and, per the brief, ready for a future
  AI-generation phase to target the same schema). The Phase 3 shape is kept only as
  `LegacyPageDocumentV1Schema`, recognized solely by the migration boundary; `schemaVersion: 2` is
  the only shape `CreateLandingPageInputSchema`/`UpdateLandingPageInputSchema` accept as new input
  going forward — a client can no longer submit a v1-shaped document.

- **Discriminated union over four section types, `.passthrough()` on props:** `hero`, `text`,
  `image`, `product_showcase` are each a `z.object({ id, type: z.literal(...), props, settings })`
  member of `z.discriminatedUnion("type", ...)`. Each `props` schema validates the fields this
  phase actually understands but keeps `.passthrough()` (not `.strict()`) so an unrecognized extra
  key is preserved rather than silently dropped — deliberately biased toward not losing merchant
  data over strict rejection.

- **`props` (content) vs. `settings` (presentation) as separate objects per section**, matching
  the brief's diagram. `settings` is intentionally tiny in this phase (`padding`, an optional hex
  `backgroundColor`) — enough to prove the separation exists without inventing a full design-token
  system.

- **Stable ids, restricted charset:** `SectionIdSchema` requires `^[A-Za-z0-9_-]+$`. Ids are never
  array indexes — the client generates them with `crypto.randomUUID()` when adding a section, and
  the reducer keys every operation (move/remove/update) off `id`, not position.

- **One migration boundary, not scattered version checks:** `server/src/modules/landingPages/pageDocumentMigration.ts`
  exports a single `migratePageDocument(raw): PageDocument`, called from exactly one place —
  `landingPageService.ts`'s `normalize()`, applied to every document read from the repository
  before it reaches contracts/API/renderer. Nothing else in the codebase special-cases a document
  shape. Detection reads `schemaVersion` (v2) or `version` (legacy v1) from the raw JSON;
  anything else (missing, or an unrecognized future version) throws `PageDocumentMigrationError`.

- **v1→v2 migration is best-effort and lossless-by-record, not lossless-by-content:** each legacy
  section is re-validated against its (now typed) v2 props schema with sensible defaults filled in
  (e.g. a missing `headline` becomes `"Untitled"`); a section whose `type` isn't one of the four
  known types can't be automatically converted (there is no schema for an arbitrary legacy type)
  — it's dropped from the rendered document, but its id/type is recorded in
  `document.metadata.migrationNotes` rather than vanishing without a trace. In practice no real
  Phase 3 document ever contained populated sections (Phase 3 shipped with no editor), so this
  path is exercised entirely by tests, not live data — but the boundary is real and will fire the
  moment a genuinely old document is read.

- **Two independent, intentionally separate product-reference mechanisms:** Phase 3's
  `LandingPageProduct` join table / top-level `productIds` field (the page's overall "associated
  products" list) is untouched. Phase 4 adds a second, independent reference surface: a
  `product_showcase` section's `props.productIds`, embedded directly in the JSON document (so the
  section knows exactly what to render). Both are validated identically — every id must resolve
  via Phase 2's `findProductByIdForShop(shopId, id)` — but they are not merged or kept in sync,
  since doing so would be surprising, undocumented behavior beyond this phase's scope. The
  document never stores anything about a product except its app-owned id — no title, price, or
  image is duplicated into `config`; the renderer resolves display data through `/api/products`
  at render/edit time.

- **Renderer dispatches through a static lookup object, never dynamic evaluation:**
  `PageRenderer.tsx`'s `SECTION_RENDERERS` is a plain `Record<SectionType, ...>` — there is no
  `eval`, no `new Function`, no component-name-from-string resolution anywhere. An entry not
  present (a type unknown to this client bundle) renders `UnknownSection` rather than throwing,
  so a schema-version mismatch between client and server fails safely instead of crashing the
  page.

- **No `dangerouslySetInnerHTML` anywhere:** `TextSection`'s `body` is plain text, rendered by
  splitting on newlines into separate `<p>` elements (React escapes text nodes automatically).
  Every URL-shaped field (`ctaTarget`, `imageUrl`, `linkUrl`) is validated by `SafeUrlSchema`,
  which rejects the `javascript:` scheme case-insensitively — the only scheme that can execute
  code when placed in an `href`/`src`. `backgroundColor` is restricted to a hex-color regex so it
  can never carry a CSS injection payload (e.g. `url(...)`).

- **Editor save reuses the existing `PATCH /api/landing-pages/:id` endpoint** (`config` field) —
  no second persistence endpoint. Server-side, `config` is validated as a full `PageDocumentSchema`
  by the existing shared-schema route validation (unchanged code path), then
  `assertDocumentProductReferencesAreValid` (new, in the service layer) checks every
  `product_showcase` reference before the write is allowed — a cross-tenant or nonexistent product
  id is rejected as a 400 `ValidationError`, exactly like Phase 3's page-level product validation,
  and this cannot be bypassed by a client that skips the editor UI and calls the API directly.

- **Editor state: one reducer, not scattered `useState` calls.** `editorReducer.ts` tracks
  `document`, `savedDocument` (for dirty comparison), `selectedSectionId`, `loading`/`loadError`,
  `saving`/`saveError`, and an in-memory `past`/`future` undo/redo history. `dirty` is derived
  (`JSON.stringify(document) !== JSON.stringify(savedDocument)`) rather than stored redundantly, so
  it can never desync from the two documents it compares. Undo/redo is document-level (whole-document
  snapshots), kept entirely in memory — never written to PostgreSQL, never used as a substitute for
  browser navigation.

- **Explicit Save only — no autosave.** The editor never calls the save endpoint except when the
  user clicks Save. The reducer/hook design (a single `save()` action reading `state.document`)
  leaves a clean seam for a future phase to add a debounced autosave without restructuring state,
  but no such background behavior exists now.

- **Simple move-up/move-down for reordering, not drag-and-drop.** The existing client has zero UI
  dependencies beyond React itself; adding a drag-and-drop library for two buttons' worth of
  functionality was judged disproportionate for this phase, matching the brief's explicit
  allowance.

- **Responsive via flex-wrap, not a device-preview simulator.** The three-pane editor layout
  (`LandingPageEditor.tsx`) uses `flexWrap: "wrap"` with `minWidth` per pane and `overflowX: "auto"`
  on the canvas, so panes stack vertically instead of overflowing horizontally on a narrow
  viewport. No separate desktop/tablet/mobile preview toggle exists yet.

- **No database migration.** `LandingPage.config` remains a single `Json` column — the schema
  change is entirely inside that JSON's shape, enforced by Zod at the application boundary, not by
  Postgres. No new tables (e.g. page-version history) were introduced.

## Consequences
- A client that bypasses the editor and calls the API directly still cannot store an invalid
  document or a cross-tenant product reference — validation happens in shared Zod schemas (shape)
  and the service layer (tenant/product ownership), not just in the UI.
- The client package still has no test harness (no vitest/testing-library configured, and the root
  `npm run test` script does not include the client workspace — unchanged from Phases 2-3). Editor
  UI components were verified by typecheck and manual reasoning, not automated tests; this is a
  pre-existing gap, not one introduced by this phase.
- As with Phases 1-3, real-PostgreSQL execution depends on a reachable Postgres — see the Phase 4
  implementation report for what actually ran in this environment.
- Deferred to a future phase, as instructed: AI generation, publishing, templates, asset upload,
  analytics, and a real device-preview simulator.
