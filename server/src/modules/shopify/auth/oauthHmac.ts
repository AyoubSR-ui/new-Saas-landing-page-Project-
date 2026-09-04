import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the `hmac` query parameter Shopify attaches to the install and
 * OAuth-callback redirects. Per Shopify's documented algorithm: drop `hmac`
 * (and the legacy `signature`) from the query, sort the remaining keys,
 * join as `key=value` pairs with `&`, and HMAC-SHA256 the result (hex) with
 * the app's client secret. Any query param not covered by this signature
 * must never be trusted before this check passes.
 */
export function verifyOAuthCallbackHmac(
  query: Record<string, unknown>,
  secret: string,
): boolean {
  const hmac = query.hmac;

  if (typeof hmac !== "string" || hmac.length === 0) {
    return false;
  }

  const rest: Record<string, unknown> = { ...query };
  delete rest.hmac;
  delete rest.signature;

  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = rest[key];
      const stringValue = Array.isArray(value) ? value.join(",") : String(value ?? "");
      return `${key}=${stringValue}`;
    })
    .join("&");

  const computed = createHmac("sha256", secret).update(message).digest("hex");

  const computedBuffer = Buffer.from(computed, "hex");
  let providedBuffer: Buffer;
  try {
    providedBuffer = Buffer.from(hmac, "hex");
  } catch {
    return false;
  }

  if (computedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, providedBuffer);
}
