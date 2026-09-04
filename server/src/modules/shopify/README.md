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
- `client/shopifyClient.ts` — minimal authenticated Admin API request helper. No
  product/business-domain calls yet — those land in Phase 2 (`products/`) and Phase 9
  (`checkout/`).
- `webhooks/` — raw-body HMAC verification + the `app/uninstalled` handler.

`products/` and `checkout/` remain empty until Phase 2 and Phase 9 respectively.
