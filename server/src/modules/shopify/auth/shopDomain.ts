// Shopify shop domains are always `<handle>.myshopify.com`. Validating this
// strictly (rather than accepting any string) is what makes it safe to embed
// the value in redirect URLs and Admin API hostnames later in the flow.
const SHOP_DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;

export class InvalidShopDomainError extends Error {
  constructor(raw: unknown) {
    super(`Invalid Shopify shop domain: ${typeof raw === "string" ? raw : typeof raw}`);
    this.name = "InvalidShopDomainError";
  }
}

/**
 * Normalizes and validates a shop domain supplied by an untrusted source
 * (query param, webhook header, JWT claim). Throws {@link InvalidShopDomainError}
 * rather than returning null, so call sites can't accidentally treat an
 * invalid domain as "no shop" and fall through to unauthenticated behavior.
 */
export function normalizeShopDomain(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new InvalidShopDomainError(raw);
  }

  const normalized = raw.trim().toLowerCase();

  if (!SHOP_DOMAIN_PATTERN.test(normalized)) {
    throw new InvalidShopDomainError(raw);
  }

  return normalized;
}
