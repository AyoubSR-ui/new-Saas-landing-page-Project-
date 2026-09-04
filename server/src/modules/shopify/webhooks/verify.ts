import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the `X-Shopify-Hmac-Sha256` header against the raw request body.
 * Must be called with the exact bytes Shopify sent (before any JSON
 * parsing/re-serialization) — re-encoding the body first would change the
 * byte sequence and make a legitimate webhook fail verification.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string | undefined,
  secret: string,
): boolean {
  if (!hmacHeader) {
    return false;
  }

  const computed = createHmac("sha256", secret).update(rawBody).digest("base64");

  const computedBuffer = Buffer.from(computed, "utf8");
  const providedBuffer = Buffer.from(hmacHeader, "utf8");

  if (computedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, providedBuffer);
}
