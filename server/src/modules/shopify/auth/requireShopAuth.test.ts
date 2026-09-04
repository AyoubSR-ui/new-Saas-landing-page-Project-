import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const API_SECRET = "test-api-secret";
const API_KEY = "test-api-key";
const INSTALLED_SHOP = "installed-shop.myshopify.com";
const UNINSTALLED_SHOP = "uninstalled-shop.myshopify.com";

const shops = vi.hoisted(
  () =>
    new Map<string, { id: string; shopDomain: string; status: "INSTALLED" | "UNINSTALLED" }>([
      ["installed-shop.myshopify.com", { id: "shop-1", shopDomain: "installed-shop.myshopify.com", status: "INSTALLED" }],
      ["uninstalled-shop.myshopify.com", { id: "shop-2", shopDomain: "uninstalled-shop.myshopify.com", status: "UNINSTALLED" }],
    ]),
);

vi.mock("../db/shopRepository.js", () => ({
  findShopByDomain: vi.fn(async (shopDomain: string) => shops.get(shopDomain) ?? null),
}));

const { requireShopAuth } = await import("./requireShopAuth.js");

function signToken(shop: string, overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: `https://${shop}/admin`,
      dest: `https://${shop}`,
      aud: API_KEY,
      sub: "1",
      exp: now + 60,
      nbf: now - 5,
      iat: now,
      ...overrides,
    },
    API_SECRET,
    { algorithm: "HS256" },
  );
}

function makeReq(authorization?: string, extra: Record<string, unknown> = {}): Request {
  return {
    header: (name: string) => (name.toLowerCase() === "authorization" ? authorization : undefined),
    ...extra,
  } as unknown as Request;
}

describe("requireShopAuth", () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  it("rejects a request with no Authorization header", async () => {
    const req = makeReq(undefined);

    await requireShopAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
    expect(req.shop).toBeUndefined();
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const req = makeReq("Basic abc123");

    await requireShopAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });

  it("rejects an invalid/forged token", async () => {
    const req = makeReq("Bearer not-a-real-token");

    await requireShopAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });

  it("accepts a valid token for an installed shop and attaches req.shop", async () => {
    const token = signToken(INSTALLED_SHOP);
    const req = makeReq(`Bearer ${token}`);

    await requireShopAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.shop).toEqual({ id: "shop-1", shopDomain: INSTALLED_SHOP });
  });

  it("rejects a valid token for a shop that has been uninstalled", async () => {
    const token = signToken(UNINSTALLED_SHOP);
    const req = makeReq(`Bearer ${token}`);

    await requireShopAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403 });
    expect(req.shop).toBeUndefined();
  });

  it("rejects a valid token for a shop with no installation record at all", async () => {
    const token = signToken("never-installed.myshopify.com");
    const req = makeReq(`Bearer ${token}`);

    await requireShopAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403 });
  });

  it("cannot be spoofed via a query/body shop parameter — auth resolves only from the token", async () => {
    // Token legitimately belongs to INSTALLED_SHOP; attacker adds a `shop`
    // query param claiming a different (also installed) shop.
    const token = signToken(INSTALLED_SHOP);
    const req = makeReq(`Bearer ${token}`, { query: { shop: "some-other-shop.myshopify.com" } });

    await requireShopAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.shop?.shopDomain).toBe(INSTALLED_SHOP);
  });
});
