// Recovery path for an embedded app that loads without a valid Shopify
// installation (e.g. right after an uninstall/reinstall cycle): detect the
// server's specific "shop is not installed" response and send the browser,
// at the top level (never inside the Shopify Admin iframe), to the
// existing server-side OAuth start route. No OAuth logic is duplicated
// here — this only ever redirects to `/api/shopify/auth`, which performs
// the real state/HMAC/token-exchange flow (see server/src/modules/shopify/auth/oauthRoutes.ts).

const SHOP_DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const RECOVERY_ATTEMPTED_KEY = "shopify-oauth-recovery-attempted";

/** Reads and validates the `shop` query param Shopify supplies on the embedded app's own iframe URL. Returns null (never an unvalidated raw value) if absent or malformed. */
export function getShopDomainFromLocation(search: string = window.location.search): string | null {
  const raw = new URLSearchParams(search).get("shop");
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return SHOP_DOMAIN_PATTERN.test(normalized) ? normalized : null;
}

export interface SessionErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * True only for the exact condition `requireShopAuth` reports when a shop
 * has no installed record (`ForbiddenError`, code "FORBIDDEN", status 403).
 * Deliberately narrow: 401 (missing/invalid session token), 500/502/503,
 * network failures, and malformed/non-JSON bodies must never match, so a
 * database outage or any other server failure is never mistaken for "needs
 * installation."
 */
export function isShopNotInstalledError(status: number, body: SessionErrorBody | null): boolean {
  return status === 403 && body?.error?.code === "FORBIDDEN";
}

/** Builds the OAuth start URL with the shop domain safely encoded via URLSearchParams (never manual string concatenation). */
export function buildInstallUrl(shopDomain: string): string {
  const url = new URL("/api/shopify/auth", window.location.origin);
  url.searchParams.set("shop", shopDomain);
  return url.toString();
}

/** Loop guard: at most one automatic recovery redirect per tab session. sessionStorage survives the full-page OAuth round trip (same tab) but not a new tab/window. */
export function hasAttemptedRecovery(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_ATTEMPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRecoveryAttempted(): void {
  try {
    sessionStorage.setItem(RECOVERY_ATTEMPTED_KEY, "1");
  } catch {
    // sessionStorage unavailable (e.g. locked-down privacy mode): worst case
    // is one extra redirect attempt, never a tight loop, since every
    // attempt navigates the top-level browser fully away from the SPA.
  }
}

/** Cleared on a successful session response, so a later legitimate uninstall/reinstall within the same tab session can still recover automatically. */
export function clearRecoveryAttempted(): void {
  try {
    sessionStorage.removeItem(RECOVERY_ATTEMPTED_KEY);
  } catch {
    // ignore
  }
}

/**
 * Performs the actual navigation, delegating to an injectable `navigate`
 * function (defaulting to `defaultNavigate`) so callers/tests can observe
 * or replace how the top-level redirect happens without touching the
 * shop-domain validation/encoding above.
 */
export function redirectTopLevelToInstall(shopDomain: string, navigate: (url: string) => void = defaultNavigate): void {
  navigate(buildInstallUrl(shopDomain));
}

/**
 * Navigates the topmost browsing context out of the embedded Shopify
 * Admin iframe — Shopify's OAuth consent page cannot and must not load
 * inside the app's iframe.
 *
 * Uses `window.open(url, "_top")` — the browser's standard named-target
 * resolution (the same mechanism `<a target="_top">` relies on) — rather
 * than writing to the cross-origin `window.top.location` property
 * directly. `_top` always resolves to an *existing* browsing context, so
 * this is not treated as opening a popup (no window/tab is created, and
 * popup blockers do not apply). This matters because a direct
 * `window.top.location.href = url` assignment, made asynchronously (after
 * awaiting App Bridge's `idToken()` and a `fetch()`, with no fresh
 * user-activation signal left over) is exactly the pattern modern
 * Chromium browsers' anti-framebusting intervention can silently drop —
 * the assignment executes with no thrown error, but no navigation ever
 * reaches the network. `window.open(..., "_top")` is not subject to that
 * same interception and is the mechanism Shopify's own guidance documents
 * for escaping the iframe when App Bridge itself does not intercept a
 * plain top-level navigation.
 */
export function defaultNavigate(url: string): void {
  const target = window.open(url, "_top");
  if (!target) {
    // Defensive fallback only — `_top` targeting an existing ancestor
    // frame should not be reachable here in a real embedded-app context.
    (window.top ?? window).location.href = url;
  }
}
