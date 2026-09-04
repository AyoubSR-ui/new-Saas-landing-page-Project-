# 0002 — Phase 1 Shopify app foundation

## Status
Accepted

## Context
Phase 1 needs to authenticate a merchant's shop, persist the installation, retain the
offline access token securely, authenticate embedded-app requests, and handle
uninstall — without building any business-domain functionality yet.

## Decisions

- **OAuth state storage:** a dedicated `OAuthState` table (single-use, TTL'd), not a
  cookie/session. The spec asks that CSRF-protection state be *persisted*; a DB row
  also sidesteps third-party-cookie restrictions inside the Shopify admin iframe and
  gives clean, inspectable test scenarios. The random state value itself (not a
  session) is what prevents CSRF — deleted on first use so it can never be replayed.

- **Two different HMAC schemes, not one:** Shopify signs OAuth install/callback
  redirects over *sorted query parameters* (`auth/oauthHmac.ts`) but signs webhooks
  over the *raw request body* (`webhooks/verify.ts`). Both use the app's client secret
  (`SHOPIFY_API_SECRET`) as the key — there is no separate Shopify "webhook secret" in
  the classic app model, so Phase 0's placeholder `SHOPIFY_WEBHOOK_SECRET` env var was
  removed rather than kept as a second, always-equal-to-the-first secret.

- **Session-token (App Bridge) auth for app requests, not classic OAuth cookies:**
  embedded-app requests are authenticated with a Shopify App Bridge session token — a
  short-lived JWT, HS256-signed by Shopify with the app's client secret, carrying the
  shop in its `dest`/`iss` claims. `requireShopAuth` derives the shop *only* from the
  verified claims, never from a client-supplied query/body value, which is what makes
  the shop unspoofable. This is the current Shopify-recommended approach for embedded
  apps (superseding the older top-level-cookie session strategy) and pairs with the
  classic authorization-code OAuth flow used to obtain the *offline* token for
  background/webhook-driven work.

- **App Bridge via CDN script, not the `@shopify/app-bridge-react` package:** App
  Bridge v4 is framework-agnostic and self-initializes from a `<meta name="shopify-api-key">`
  tag plus the `https://cdn.shopify.com/shopifycloud/app-bridge.js` script, exposing
  `window.shopify.idToken()`. This avoids an extra dependency for what Phase 1 needs
  (obtaining a session token to prove authenticated communication) — the client shell
  stays deliberately minimal per the phase scope.

- **Token encryption:** AES-256-GCM (authenticated encryption — a tampered or corrupted
  ciphertext fails to decrypt rather than silently returning wrong plaintext), key from
  `TOKEN_ENCRYPTION_KEY` (32 raw bytes, base64, validated at startup in `env.ts` and
  again defensively inside `tokenCipher.ts`). Ciphertext is stored as a single
  self-describing string (`v1.<iv>.<authTag>.<ciphertext>`, each part base64) rather
  than separate columns, keeping the `Shop` schema to one nullable text field.

- **Uninstall nulls the ciphertext, doesn't delete the row:** the spec asks that the
  stored token "can no longer be used" *and* that the installation record be preserved
  for auditability. Setting `accessTokenCiphertext = null` on uninstall satisfies both:
  the plaintext token is unrecoverable at the data layer (not merely gated by an
  application-level status check), while `Shop.shopDomain`/timestamps remain for
  history. Uninstall processing is idempotent by checking current status before
  touching anything, so a repeated webhook delivery is a no-op.

- **Minimal `Shop` fields, no speculative columns:** `shopDomain` (unique) doubles as
  the natural identifier — no separate numeric Shopify shop ID is fetched, since doing
  so would require an extra Admin API call that isn't needed for auth to work and edges
  toward Phase 2's product/business-domain territory. `scopes` is kept because it's
  genuinely required to know what the stored token can do (and to detect a scope
  change on reinstall) — not speculative.

## Consequences
- No product, template, or checkout logic exists yet; `client/shopifyClient.ts` is
  a generic authenticated-request helper only.
- Local Docker/Postgres availability determines whether the Prisma migration and the
  real-database integration test could be run in this session — reported explicitly in
  the Phase 1 report rather than assumed.
