import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedProduct } from "./types.js";

const state = vi.hoisted(() => ({
  pages: [] as NormalizedProduct[][],
  upsertCalls: [] as string[],
  wasCreatedFor: new Map<string, boolean>(),
  deactivateCalls: [] as string[][],
  shouldThrowOnPage: -1,
}));

vi.mock("./shopifyProductAdapter.js", () => ({
  iterateShopifyProducts: async function* (_shopDomain: string) {
    for (let i = 0; i < state.pages.length; i++) {
      if (i === state.shouldThrowOnPage) {
        throw new Error("simulated fetch failure");
      }
      yield state.pages[i];
    }
  },
}));

vi.mock("./productRepository.js", () => ({
  upsertProduct: vi.fn(async (_shopId: string, normalized: NormalizedProduct) => {
    state.upsertCalls.push(normalized.shopifyProductId);
    return {
      product: { id: normalized.shopifyProductId },
      wasCreated: state.wasCreatedFor.get(normalized.shopifyProductId) ?? true,
    };
  }),
  deactivateProductsNotIn: vi.fn(async (_shopId: string, seen: string[]) => {
    state.deactivateCalls.push(seen);
    return 0;
  }),
}));

const { syncShopProducts } = await import("./productSync.js");
const { deactivateProductsNotIn, upsertProduct } = await import("./productRepository.js");

function product(id: string): NormalizedProduct {
  return {
    shopifyProductId: id,
    title: `Product ${id}`,
    handle: id,
    description: null,
    vendor: null,
    productType: null,
    status: "ACTIVE",
    images: [],
    variants: [],
  };
}

const SHOP = { id: "shop-1", shopDomain: "my-shop.myshopify.com" };

describe("syncShopProducts", () => {
  beforeEach(() => {
    state.pages = [];
    state.upsertCalls = [];
    state.wasCreatedFor = new Map();
    state.deactivateCalls = [];
    state.shouldThrowOnPage = -1;
    vi.clearAllMocks();
  });

  it("upserts every product across all pages and reports counts", async () => {
    state.pages = [[product("p1"), product("p2")], [product("p3")]];
    state.wasCreatedFor = new Map([
      ["p1", true],
      ["p2", true],
      ["p3", false],
    ]);

    const result = await syncShopProducts(SHOP);

    expect(result).toEqual({
      productsSeen: 3,
      productsCreated: 2,
      productsUpdated: 1,
      productsDeactivated: 0,
    });
    expect(state.upsertCalls).toEqual(["p1", "p2", "p3"]);
  });

  it("is idempotent: running twice with unchanged data does not duplicate upserts and reports updates, not creates", async () => {
    state.pages = [[product("p1")]];
    state.wasCreatedFor = new Map([["p1", true]]);
    await syncShopProducts(SHOP);

    state.wasCreatedFor = new Map([["p1", false]]);
    const second = await syncShopProducts(SHOP);

    expect(second.productsCreated).toBe(0);
    expect(second.productsUpdated).toBe(1);
    expect(vi.mocked(upsertProduct)).toHaveBeenCalledTimes(2);
  });

  it("passes every seen shopifyProductId to deactivateProductsNotIn after all pages complete", async () => {
    state.pages = [[product("p1"), product("p2")]];

    await syncShopProducts(SHOP);

    expect(state.deactivateCalls).toEqual([["p1", "p2"]]);
  });

  it("does not call deactivateProductsNotIn if a page fetch fails partway through", async () => {
    state.pages = [[product("p1")], [product("p2")]];
    state.shouldThrowOnPage = 1;

    await expect(syncShopProducts(SHOP)).rejects.toThrow("simulated fetch failure");
    expect(vi.mocked(deactivateProductsNotIn)).not.toHaveBeenCalled();
    // The first page's product was still upserted before the failure.
    expect(state.upsertCalls).toEqual(["p1"]);
  });

  it("handles a shop with zero products by deactivating nothing seen", async () => {
    state.pages = [[]];

    const result = await syncShopProducts(SHOP);

    expect(result.productsSeen).toBe(0);
    expect(state.deactivateCalls).toEqual([[]]);
  });
});
