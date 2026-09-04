import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../security/tokenCipher.js";

interface MockShop {
  id: string;
  shopDomain: string;
  accessTokenCiphertext: string | null;
  status: "INSTALLED" | "UNINSTALLED";
}

const shops = vi.hoisted(() => new Map<string, MockShop>());

vi.mock("../db/shopRepository.js", () => ({
  findShopByDomain: vi.fn(async (shopDomain: string) => shops.get(shopDomain) ?? null),
}));

const { shopifyAdminApiRequest, ShopifyApiError, ShopNotInstalledError } = await import(
  "./shopifyClient.js"
);

const SHOP = "my-shop.myshopify.com";
const REAL_TOKEN = "shpat_do_not_leak_this_value";

describe("shopifyAdminApiRequest", () => {
  beforeEach(() => {
    shops.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ShopNotInstalledError for a shop with no installation record", async () => {
    await expect(shopifyAdminApiRequest(SHOP, "/shop.json")).rejects.toThrow(ShopNotInstalledError);
  });

  it("throws ShopNotInstalledError for an uninstalled shop, without calling Shopify", async () => {
    shops.set(SHOP, { id: "1", shopDomain: SHOP, accessTokenCiphertext: null, status: "UNINSTALLED" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(shopifyAdminApiRequest(SHOP, "/shop.json")).rejects.toThrow(ShopNotInstalledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the decrypted token as X-Shopify-Access-Token and returns the parsed body", async () => {
    shops.set(SHOP, {
      id: "1",
      shopDomain: SHOP,
      accessTokenCiphertext: encryptToken(REAL_TOKEN),
      status: "INSTALLED",
    });

    let capturedHeaders: RequestInit["headers"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ shop: { name: "Test Shop" } }), { status: 200 });
      }),
    );

    const result = await shopifyAdminApiRequest(SHOP, "/shop.json");

    expect(result).toEqual({ shop: { name: "Test Shop" } });
    expect((capturedHeaders as Record<string, string>)["X-Shopify-Access-Token"]).toBe(REAL_TOKEN);
  });

  it("throws ShopifyApiError on a non-OK response without leaking the token", async () => {
    shops.set(SHOP, {
      id: "1",
      shopDomain: SHOP,
      accessTokenCiphertext: encryptToken(REAL_TOKEN),
      status: "INSTALLED",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    await expect(shopifyAdminApiRequest(SHOP, "/shop.json")).rejects.toMatchObject({
      status: 403,
    });

    try {
      await shopifyAdminApiRequest(SHOP, "/shop.json");
    } catch (err) {
      expect(err).toBeInstanceOf(ShopifyApiError);
      expect((err as Error).message).not.toContain(REAL_TOKEN);
    }
  });
});
