# 0004 — Phase 3 landing page domain & data foundation

## Status
Accepted

## Context
Phase 3 needs a tenant-isolated, app-owned persistence model and CRUD API for landing
page drafts, built to survive future phases (visual editor, AI generation, publishing,
analytics, templates) without a destructive redesign — while explicitly not building
any of those things yet.

## Decisions

- **New top-level module, not nested under `modules/shopify/`:** unlike `Product`
  (mirrored *from* Shopify), a `LandingPage` is an app-owned concept the merchant
  creates in this app — it has no Shopify-side counterpart. It lives in
  `server/src/modules/landingPages/`, a sibling to `modules/shopify/`, and reuses
  `modules/shopify/auth/requireShopAuth.ts` across the module boundary (the same
  session-token middleware already used for products) rather than duplicating
  authentication.

- **`/api/landing-pages`, not `/api/pages`:** Phase 1/2's `routes/index.ts` left a
  `// Mounted in later phases: /api/pages (Phase 3+)` placeholder comment, but this
  phase's brief specifies `/api/landing-pages` explicitly. The explicit, current
  instruction wins over a stale forward-looking comment; the comment has been removed
  now that the route exists.

- **Explicit two-state lifecycle (`DRAFT` | `PUBLISHED`), no publishing behavior
  wired to it:** `LandingPageStatus` exists purely as domain state for a future
  publishing phase to act on. Setting a page to `PUBLISHED` in this phase has zero
  side effects (no storefront deployment, no theme changes) — it is just a flag,
  matching the brief's explicit instruction not to build publishing yet.

- **Versioned, Shopify-agnostic JSON config, not a rigid relational schema:**
  `LandingPage.config` is a single `Json` column holding `{ version: 1, sections: [{
  id, type, props }] }` (`shared/src/schemas/landingPage.schema.ts`). `type` and `props`
  are intentionally opaque at this phase — a future visual-editor phase defines concrete
  section types without a database migration. `version` exists so that phase can
  migrate old configs forward. This also keeps the persisted structure decoupled from
  any Shopify API payload shape, as required.

- **Soft deletion, mirroring the Shop/Product pattern:** `deletedAt` (not row deletion)
  on `DELETE /api/landing-pages/:id` — the same pattern already established for
  `Shop.uninstalledAt` and `Product.deletedAt`. Deleted pages are excluded from list/get
  by default (`deletedAt: null` in every read), same convention as Phase 2.

- **Product association is a join table validated at the service layer, not the
  schema layer:** `LandingPageProduct` (`@@unique([landingPageId, productId])`) links a
  page to a Phase 2 `Product`. Prisma cannot express "productId's shop must equal
  landingPageId's shop" as a schema constraint, so `landingPageService.ts` resolves
  every incoming `productId` through Phase 2's existing shop-scoped
  `findProductByIdForShop` *before* any association is persisted — a product from
  another shop (or a nonexistent id) is rejected identically, as a `ValidationError`,
  without revealing which. This is tested explicitly at both the service level (mocked)
  and the repository level (an integration test demonstrating the repository has no
  built-in cross-tenant protection, by design, to make the service-layer dependency
  visible rather than assumed).

- **Upsert-and-prune for product associations on update, not delete-and-recreate:**
  `updateLandingPage`'s `productIds` replaces the association set by upserting each
  (keyed by `(landingPageId, productId)`) and deleting only the rows no longer present
  — the same pattern Phase 2 uses for variants/images, chosen for the same reason
  (idempotent, no duplicate-row risk, doesn't gratuitously touch unrelated rows).

- **Slug uniqueness enforced by the database, not a check-then-insert race:**
  `@@unique([shopId, slug])` is the source of truth; the service layer attempts the
  write and translates Prisma's `P2002` unique-violation into a `409 ConflictError`
  (new — added to `utils/errors.ts` alongside the existing `NotFoundError`/
  `ValidationError`/etc., since none of the existing error types fit a uniqueness
  conflict). This avoids a TOCTOU gap between checking availability and creating the
  row. A title with no derivable slug falls back to `slugify()` returning `"page"`
  rather than failing.

## Consequences
- No visual editor, drag-and-drop, block editor, AI generation, publishing/storefront
  deployment, templates, analytics, or billing exists anywhere in this codebase — this
  phase is the domain/CRUD foundation those future phases will build on.
- `LandingPageSection.props` being an opaque `Record<string, unknown>` means Phase 3
  does zero validation of section-specific content — intentional, since concrete
  section types don't exist yet; a future editor phase will add per-type schemas.
- As with Phases 1-2, the real-PostgreSQL path (migration apply + integration tests)
  depends on a reachable Postgres — see the Phase 3 implementation report for what
  actually ran in this environment.
