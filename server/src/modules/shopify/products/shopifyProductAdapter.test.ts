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

const { iterateShopifyProducts } = await import("./shopifyProductAdapter.js");
const { ShopifyApiError } = await import("../client/shopifyClient.js");
const { ShopifyProductAdapterError } = await import("./shopifyProductAdapter.js");

const SHOP = "my-shop.myshopify.com";

function graphqlResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("iterateShopifyProducts", () => {
  beforeEach(() => {
    shops.clear();
    shops.set(SHOP, {
      id: "shop-1",
      shopDomain: SHOP,
      accessTokenCiphertext: encryptToken("shpat_token"),
      status: "INSTALLED",
    });
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and normalizes a single page of products", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        graphqlResponse({
          data: {
            products: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/Product/1",
                    title: "Mug",
                    handle: "mug",
                    descriptionHtml: "<p>A mug</p>",
                    vendor: "Acme",
                    productType: "Kitchen",
                    status: "ACTIVE",
                    images: { edges: [] },
                    variants: {
                      edges: [
                        {
                          node: {
                            id: "gid://shopify/ProductVariant/10",
                            title: "Default Title",
                            sku: "MUG-1",
                            price: "9.99",
                            compareAtPrice: null,
                            inventoryQuantity: 5,
                            selectedOptions: [],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      ),
    );

    const pages = await collect(iterateShopifyProducts(SHOP));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0]?.[0]).toMatchObject({
      shopifyProductId: "gid://shopify/Product/1",
      title: "Mug",
      variants: [expect.objectContaining({ shopifyVariantId: "gid://shopify/ProductVariant/10", price: "9.99" })],
    });
  });

  it("pages through multiple pages using the returned cursor", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { variables: { after: string | null } };
      const isFirstPage = body.variables.after === null;

      return graphqlResponse({
        data: {
          products: {
            edges: [
              {
                node: {
                  id: isFirstPage ? "gid://shopify/Product/1" : "gid://shopify/Product/2",
                  title: isFirstPage ? "First" : "Second",
                  handle: isFirstPage ? "first" : "second",
                  descriptionHtml: null,
                  vendor: null,
                  productType: null,
                  status: "ACTIVE",
                  images: { edges: [] },
                  variants: { edges: [] },
                },
              },
            ],
            pageInfo: isFirstPage
              ? { hasNextPage: true, endCursor: "cursor-1" }
              : { hasNextPage: false, endCursor: null },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pages = await collect(iterateShopifyProducts(SHOP));
    expect(pages).toHaveLength(2);
    expect(pages[0]?.[0]?.title).toBe("First");
    expect(pages[1]?.[0]?.title).toBe("Second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles a product with no images and multiple variants", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        graphqlResponse({
          data: {
            products: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/Product/1",
                    title: "Shirt",
                    handle: "shirt",
                    descriptionHtml: null,
                    vendor: null,
                    productType: null,
                    status: "DRAFT",
                    images: { edges: [] },
                    variants: {
                      edges: [
                        {
                          node: {
                            id: "gid://shopify/ProductVariant/1",
                            title: "Small",
                            sku: null,
                            price: "10.00",
                            compareAtPrice: null,
                            inventoryQuantity: null,
                            selectedOptions: [{ name: "Size", value: "Small" }],
                          },
                        },
                        {
                          node: {
                            id: "gid://shopify/ProductVariant/2",
                            title: "Large",
                            sku: null,
                            price: "12.00",
                            compareAtPrice: "15.00",
                            inventoryQuantity: 3,
                            selectedOptions: [{ name: "Size", value: "Large" }],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      ),
    );

    const pages = await collect(iterateShopifyProducts(SHOP));
    expect(pages[0]?.[0]?.images).toEqual([]);
    expect(pages[0]?.[0]?.variants).toHaveLength(2);
  });

  it("throws ShopifyApiError on a non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));

    await expect(collect(iterateShopifyProducts(SHOP))).rejects.toThrow(ShopifyApiError);
  });

  it("throws ShopifyApiError when the GraphQL response carries an errors array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => graphqlResponse({ errors: [{ message: "Throttled" }] })));

    await expect(collect(iterateShopifyProducts(SHOP))).rejects.toThrow(ShopifyApiError);
  });

  it("throws ShopifyProductAdapterError for a malformed/unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => graphqlResponse({ data: {} })));

    await expect(collect(iterateShopifyProducts(SHOP))).rejects.toThrow(ShopifyProductAdapterError);
  });

  it("throws ShopifyProductAdapterError when a product node is missing required fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        graphqlResponse({
          data: {
            products: {
              edges: [{ node: { id: "gid://shopify/Product/1" /* missing title/handle */ } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      ),
    );

    await expect(collect(iterateShopifyProducts(SHOP))).rejects.toThrow(ShopifyProductAdapterError);
  });
});
