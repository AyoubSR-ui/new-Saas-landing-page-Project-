import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhookHmac } from "./verify.js";

const SECRET = "test-client-secret";

function sign(body: Buffer): string {
  return createHmac("sha256", SECRET).update(body).digest("base64");
}

describe("verifyShopifyWebhookHmac", () => {
  it("accepts a correctly signed raw body", () => {
    const body = Buffer.from(JSON.stringify({ id: 123, domain: "my-shop.myshopify.com" }));
    const hmac = sign(body);

    expect(verifyShopifyWebhookHmac(body, hmac, SECRET)).toBe(true);
  });

  it("rejects a body that was mutated after signing", () => {
    const original = Buffer.from(JSON.stringify({ id: 123 }));
    const hmac = sign(original);
    const mutated = Buffer.from(JSON.stringify({ id: 999 }));

    expect(verifyShopifyWebhookHmac(mutated, hmac, SECRET)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = Buffer.from(JSON.stringify({ id: 123 }));
    const wrongHmac = createHmac("sha256", "wrong-secret").update(body).digest("base64");

    expect(verifyShopifyWebhookHmac(body, wrongHmac, SECRET)).toBe(false);
  });

  it("rejects a missing hmac header without throwing", () => {
    const body = Buffer.from(JSON.stringify({ id: 123 }));

    expect(() => verifyShopifyWebhookHmac(body, undefined, SECRET)).not.toThrow();
    expect(verifyShopifyWebhookHmac(body, undefined, SECRET)).toBe(false);
  });

  it("rejects a malformed (non-base64-length) hmac header without throwing", () => {
    const body = Buffer.from(JSON.stringify({ id: 123 }));

    expect(() => verifyShopifyWebhookHmac(body, "short", SECRET)).not.toThrow();
    expect(verifyShopifyWebhookHmac(body, "short", SECRET)).toBe(false);
  });

  it("verifies against raw JSON-key-order-sensitive bytes (proves it isn't parsing first)", () => {
    const orderA = Buffer.from('{"a":1,"b":2}');
    const orderB = Buffer.from('{"b":2,"a":1}');
    const hmacForOrderA = sign(orderA);

    // Same logical JSON, different byte sequence -> must not verify against orderB.
    expect(verifyShopifyWebhookHmac(orderB, hmacForOrderA, SECRET)).toBe(false);
    expect(verifyShopifyWebhookHmac(orderA, hmacForOrderA, SECRET)).toBe(true);
  });
});
