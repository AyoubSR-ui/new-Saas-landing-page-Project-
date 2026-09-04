# 0003 — Phase 2 product data foundation

## Status
Accepted

## Context
Phase 2 needs the application to hold its own copy of a shop's Shopify product
catalog — read-only, normalized, and strictly tenant-scoped — so that a future
landing-page system (Phase 3+) has stable, application-owned data to build against
instead of calling Shopify synchronously on every request.

## Decisions

- **Adapter pattern, two adapters into one normalized shape:** Shopify product data
  reaches this app two ways — a full catalog sync (Admin GraphQL API) and per-product
  webhooks (`products/create|update|delete`, REST-shaped payloads). Rather than
  branching persistence logic on the source, both `shopifyProductAdapter.ts` (GraphQL)
  and `webhookProductAdapter.ts` (REST) convert their respective shapes into the same
  `NormalizedProduct`/`NormalizedVariant`/`NormalizedProductImage` types
  (`products/types.ts`), so `productRepository.ts` and `productSync.ts` never need to
  know which path produced the data.

- **GID normalization across both ingestion paths:** GraphQL identifies resources by
  GID string (`gid://shopify/Product/123`); REST webhooks send a bare numeric id. Both
  adapters convert to the same GID string (`toShopifyGid`) before persistence, so a
  product first seen via sync and later updated via webhook (or vice versa) always
  resolves to the same row instead of creating a duplicate.

- **GraphQL reuses the Phase 1 Admin API client unchanged:** `shopifyAdminApiRequest`
  (Phase 1) is a generic path/method/body request helper; the product query is issued
  as `POST /graphql.json` through it, with no changes to that function. This avoids a
  second token-loading/authentication code path — Phase 2 introduces zero new Shopify
  authentication logic.

- **Cursor pagination, page-at-a-time persistence:** `iterateShopifyProducts` is an
  async generator that fetches one page (50 products) at a time and yields it
  immediately; `productSync.ts` upserts each page as it arrives rather than
  accumulating the whole catalog in memory first. A shop with more than one page of
  products is a normal case, not an edge case.

- **Upsert variants/images by their own Shopify id, not delete-and-recreate:**
  `upsertProduct` upserts each variant/image keyed by `(productId, shopifyVariantId)` /
  `(productId, shopifyImageId)`, then deletes only the rows no longer present in the
  latest snapshot. This keeps a variant's internal id stable across repeated syncs —
  important once a future phase stores a foreign key to a specific variant — at the
  cost of slightly more code than a blanket delete-then-insert.

- **Soft deletion, mirroring Shop's own pattern:** a product removed from Shopify gets
  `deletedAt` stamped (via the `products/delete` webhook, or via a full sync noticing
  it's missing) rather than being deleted outright — the same pattern Phase 1 already
  established for `Shop.uninstalledAt`. Historical rows survive in case a future
  landing page references the product. `deletedAt` is independent of `status`, which
  mirrors Shopify's own ACTIVE/ARCHIVED/DRAFT product status and means something
  different (a product can be ACTIVE in Shopify and still `deletedAt` here if Shopify
  later reports it removed).

- **No denormalized "featured image" column:** rather than storing a duplicate
  featured-image reference on `Product`, the featured image is simply the
  `ProductImage` row with the lowest `position` for that product, computed at the API
  layer (`productContracts.ts`). One fewer field to keep in sync.

- **`/api/products`, not `/api/shopify/products`:** the routes/index.ts scaffolding
  left by Phase 1 already reserved `/api/products` for this phase (as a comment) — this
  keeps business-domain APIs (products, later pages/templates) separate from the
  Shopify-integration-specific `/api/shopify` namespace (OAuth, session, webhooks),
  even though the implementation code for products still lives under
  `modules/shopify/products/` since it's Shopify-sourced data.

- **Webhook verification helper, not a generic webhook framework:** `webhookRequest.ts`
  factors out the HMAC-verify + shop-domain-normalize + JSON-parse steps shared by the
  three new product webhook routes, reusing Phase 1's `verifyShopifyWebhookHmac`
  unchanged. It intentionally does not touch or generalize Phase 1's existing
  `app/uninstalled` handler, and does not attempt to build a registration/dispatch
  framework for arbitrary future webhook topics.

- **`products/create` and `products/update` share one handler:** both webhook topics
  resolve to the same upsert; there is no meaningful difference in how this app should
  react to "a product was created" vs. "a product was updated" at this phase, so one
  Express handler is registered for both routes.

- **Decimal, not float, for money:** `Variant.price`/`compareAtPrice` are Postgres
  `DECIMAL(12,2)` via Prisma's `Decimal` type — exact, matching Shopify's own decimal
  string representation, with no floating-point rounding risk.

## Consequences
- The product read/sync API (`GET /api/products`, `GET /api/products/:id`,
  `POST /api/products/sync`) is strictly read-only with respect to Shopify — there is
  no product create/update/delete endpoint, and no Shopify product mutation exists
  anywhere in this codebase yet.
- Variant/image pagination within a single product is capped (100 variants, 20 images)
  rather than fully cursor-paginated — a documented, deliberate limitation for a phase
  scoped to product data infrastructure, not asset management.
- As with Phase 1, the real-PostgreSQL path (migration apply + integration tests) is
  exercised by CI's Postgres service, not necessarily locally — see the Phase 2
  implementation report for what ran in this environment.
