# shopify module

Isolated Shopify integration layer. No Shopify API calls, HMAC verification, or token
handling should happen anywhere outside this module.

## Three trust boundaries (see routes.ts)

- **Unauthenticated** — `auth/oauthRoutes.ts` (`GET /auth`, `GET /auth/callback`). This
  *establishes* trust; nothing here is itself authenticated.
- **Session-token-authenticated** — `sessionRoutes.ts` and any future embedded-app API,
  gated by `auth/requireShopAuth.ts`. The shop identity comes only from the verified
  JWT `dest` claim, never from a client-supplied parameter.
- **Webhook (HMAC)-authenticated** — `webhooks/appUninstalled.ts`, gated by
  `webhooks/verify.ts` against the raw request body (see `webhooks/rawBody.ts`).

## Layout

- `config.ts` — validated Shopify env config + derived OAuth redirect URI.
- `auth/` — shop domain validation, OAuth state (CSRF), OAuth callback HMAC, code→token
  exchange, session-token verification, `requireShopAuth` middleware.
- `security/tokenCipher.ts` — AES-256-GCM encryption for offline access tokens at rest.
- `db/shopRepository.ts` — the only code allowed to read/write the `Shop` Prisma model.
- `client/shopifyClient.ts` — minimal authenticated Admin API request helper, reused
  as-is (including for GraphQL — see `products/shopifyProductAdapter.ts`) by every
  later phase's Shopify calls. No mutation calls exist yet; Phase 2 is read-only with
  respect to Shopify data.
- `products/` (Phase 2) — the product data foundation. `types.ts` defines the
  application-owned normalized shape; `shopifyProductAdapter.ts` (GraphQL sync) and
  `webhookProductAdapter.ts` (REST webhook payloads) both convert Shopify's shapes into
  it; `productRepository.ts` is the only code allowed to touch the `Product`/`Variant`/
  `ProductImage` Prisma models; `productSync.ts` orchestrates a full catalog sync;
  `productContracts.ts` maps persisted rows to the shared API response schemas;
  `routes.ts` exposes the authenticated, shop-scoped read/sync endpoints (mounted at
  `/api/products`, not under `/api/shopify`).
- `webhooks/` — raw-body HMAC verification, the `app/uninstalled` handler, and (Phase 2)
  `products.ts` (`products/create|update|delete`) built on the shared
  `webhookRequest.ts` verify-and-parse helper.

`checkout/` remains empty until Phase 9.
