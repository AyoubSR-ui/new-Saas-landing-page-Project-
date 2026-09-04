import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyOAuthCallbackHmac } from "./oauthHmac.js";

const SECRET = "test-client-secret";

function sign(params: Record<string, string>): string {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHmac("sha256", SECRET).update(message).digest("hex");
}

describe("verifyOAuthCallbackHmac", () => {
  it("accepts a correctly signed query", () => {
    const params = { shop: "my-shop.myshopify.com", code: "abc123", state: "xyz", timestamp: "1000" };
    const hmac = sign(params);

    expect(verifyOAuthCallbackHmac({ ...params, hmac }, SECRET)).toBe(true);
  });

  it("rejects a tampered parameter (shop swapped after signing)", () => {
    const params = { shop: "my-shop.myshopify.com", code: "abc123", state: "xyz", timestamp: "1000" };
    const hmac = sign(params);

    expect(
      verifyOAuthCallbackHmac({ ...params, shop: "attacker-shop.myshopify.com", hmac }, SECRET),
    ).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const params = { shop: "my-shop.myshopify.com", code: "abc123" };
    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${(params as Record<string, string>)[key]}`)
      .join("&");
    const wrongHmac = createHmac("sha256", "wrong-secret").update(message).digest("hex");

    expect(verifyOAuthCallbackHmac({ ...params, hmac: wrongHmac }, SECRET)).toBe(false);
  });

  it("rejects a missing hmac parameter", () => {
    expect(verifyOAuthCallbackHmac({ shop: "my-shop.myshopify.com" }, SECRET)).toBe(false);
  });

  it("rejects a non-hex hmac parameter without throwing", () => {
    expect(() =>
      verifyOAuthCallbackHmac({ shop: "my-shop.myshopify.com", hmac: "not-hex-!!" }, SECRET),
    ).not.toThrow();
    expect(verifyOAuthCallbackHmac({ shop: "my-shop.myshopify.com", hmac: "not-hex-!!" }, SECRET)).toBe(
      false,
    );
  });

  it("excludes hmac and legacy signature params from the signed message", () => {
    const params = { shop: "my-shop.myshopify.com", code: "abc123" };
    const hmac = sign(params);

    expect(
      verifyOAuthCallbackHmac({ ...params, hmac, signature: "irrelevant-legacy-value" }, SECRET),
    ).toBe(true);
  });
});
