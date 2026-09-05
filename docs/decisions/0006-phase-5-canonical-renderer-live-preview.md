# 0006 — Phase 5 canonical renderer & live preview

## Status
Accepted

## Context
Phase 4 shipped `PageRenderer` and four typed section components, but `PageRenderer` itself took
`selectedSectionId`/`onSelectSection` as first-class props and applied selection-outline/click
styling directly around every section — editor-only concerns baked into what was meant to be the
one canonical, reusable rendering path. Phase 5's brief explicitly names this pattern as something
to avoid ("editor controls must remain separate from production page rendering"), so fixing it was
a concrete, in-scope prerequisite for building a standalone preview that reuses the same renderer.

## Decisions

- **`SectionRenderer` extracted as the single per-section dispatch primitive.** `PageRenderer`
  loops over `document.sections` and delegates each one to `SectionRenderer`, which holds the
  static `Record<SectionType, ...>` lookup (unchanged from Phase 4) and the unknown-type fallback.
  Both the editor's live preview and the new standalone preview call `PageRenderer`; neither
  reimplements section dispatch.

- **`renderSectionContainer` render-prop is how the editor adds affordances, not a new parallel
  renderer.** `PageRenderer`'s default container applies only production styling (padding/
  background from the section's own `settings`). `LandingPageEditor` is the only caller that
  passes a custom `renderSectionContainer`, adding the click-to-select handler and selection
  outline around the *canonically rendered* section content — the section's own output is never
  altered. `PagePreviewView` (new) calls `PageRenderer` with no override at all, proving the same
  component renders cleanly with zero editor coupling.

- **Live preview needs no database round trip.** `LandingPageEditor` already rendered
  `state.document` directly — the in-memory document the reducer owns — so every reducer action
  (`ADD_SECTION`, `REMOVE_SECTION`, `MOVE_SECTION`, `UPDATE_SECTION_PROPS`, `UPDATE_SECTION_SETTINGS`,
  `UNDO`/`REDO`) already re-renders the preview on the next tick via React state. No new
  wiring was required for this requirement; Phase 5 verifies it directly by driving the real
  reducer and asserting on the real `PageRenderer` output (`editorPreview.test.tsx`).

- **Standalone preview reuses the existing view-switching convention, not a new router.** The
  client has no URL-based routing (Shopify embedded apps typically don't need one); view switching
  is local `useState` in `App.tsx` (`editingPageId`, now also `previewingPageId`). `PagePreviewView`
  follows that same pattern rather than introducing a routing dependency.

- **A minimal client test harness was added** (`vitest` + `jsdom` + `@testing-library/react` +
  `@testing-library/jest-dom`), scoped to the client workspace, because Phase 5 explicitly
  requires renderer and live-preview tests that are only meaningful as rendered-DOM assertions.
  Wired into the root `npm test` script and therefore into existing CI (`ci.yml` already runs
  `npm run test`) so these tests execute automatically going forward, not as a one-off.

- **Empty/unsupported/invalid states, minimally scoped:** `PageRenderer` renders a plain "no
  sections yet" message for zero sections; `SectionRenderer`'s fallback for an unrecognized type
  renders a visible `role="alert"` element and logs a dev-only console warning (development
  identifiability, no behavior change in production); `ImageSection`/`ProductShowcaseSection`
  gained defensive empty-value rendering (no url, no selected products) since Phase 5 explicitly
  calls these out, even though the shared schema already prevents most of these cases from
  reaching the renderer in practice.

- **No database or schema changes.** Confirmed and left untouched — `LandingPage.config` remains
  the Phase 4 `Json` column; nothing about persistence semantics changed.

## Consequences
- `PageRenderer`'s public prop surface changed (`selectedSectionId`/`onSelectSection` replaced by
  `renderSectionContainer`) — an intentional, Phase-4-internal API change; no persisted data or
  external contract was affected, since `PageRenderer` is not exported outside the client bundle.
- The client workspace now participates in `npm run test` and CI; a slower client test run is the
  cost of the coverage Phase 5 explicitly asked for.
- `PagePreviewView` reuses the same tenant-scoped, authenticated API calls as the editor — it is
  not a public/unauthenticated preview and does not constitute publishing.
