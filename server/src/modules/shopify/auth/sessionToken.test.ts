import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidSessionTokenError, verifySessionToken } from "./sessionToken.js";

// Matches server/vitest.setup.ts fixtures.
const API_SECRET = "test-api-secret";
const API_KEY = "test-api-key";
const SHOP = "my-shop.myshopify.com";

function signSessionToken(overrides: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: API_KEY,
    sub: "1",
    exp: now + 60,
    nbf: now - 5,
    iat: now,
    jti: "test-jti",
    sid: "test-sid",
    ...overrides,
  };
  return jwt.sign(payload, API_SECRET, { algorithm: "HS256", ...options });
}

describe("verifySessionToken", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("accepts a validly signed, well-formed token", () => {
    const token = signSessionToken();
    const result = verifySessionToken(token);

    expect(result.shopDomain).toBe(SHOP);
    expect(result.userId).toBe("1");
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = signSessionToken({}, {});
    const forged = jwt.sign(jwt.decode(token) as object, "wrong-secret", { algorithm: "HS256" });

    expect(() => verifySessionToken(forged)).toThrow(InvalidSessionTokenError);
  });

  it("rejects a token with the wrong audience", () => {
    const token = signSessionToken({ aud: "someone-elses-api-key" });

    expect(() => verifySessionToken(token)).toThrow(InvalidSessionTokenError);
  });

  it("rejects an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSessionToken({ exp: now - 10, iat: now - 70 });

    expect(() => verifySessionToken(token)).toThrow(InvalidSessionTokenError);
  });

  it("rejects a not-yet-valid token", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSessionToken({ nbf: now + 3600 });

    expect(() => verifySessionToken(token)).toThrow(InvalidSessionTokenError);
  });

  it("rejects a token whose dest and iss refer to different shops", () => {
    const token = signSessionToken({ iss: "https://other-shop.myshopify.com/admin" });

    expect(() => verifySessionToken(token)).toThrow(InvalidSessionTokenError);
  });

  it("rejects a token with a malformed dest claim", () => {
    const token = signSessionToken({ dest: "not-a-url" });

    expect(() => verifySessionToken(token)).toThrow(InvalidSessionTokenError);
  });

  it("rejects a completely malformed token string", () => {
    expect(() => verifySessionToken("not.a.jwt")).toThrow(InvalidSessionTokenError);
  });

  it("rejects an unsigned 'none' algorithm token", () => {
    const none = jwt.sign(
      { iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY },
      "",
      { algorithm: "none" },
    );

    expect(() => verifySessionToken(none)).toThrow(InvalidSessionTokenError);
  });
});
