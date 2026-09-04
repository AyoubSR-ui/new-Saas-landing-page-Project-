import { describe, expect, it } from "vitest";
import { Prisma } from "../../../../prisma/generated/index.js";
import { toProductDetailResponse, toProductListResponse, toProductSyncResponse } from "./productContracts.js";
import type { ProductWithRelations } from "./productRepository.js";

function makeProduct(overrides: Partial<ProductWithRelations> = {}): ProductWithRelations {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "product-1",
    shopId: "shop-1",
    shopifyProductId: "gid://shopify/Product/1",
    title: "Mug",
    handle: "mug",
    description: "<p>A mug</p>",
    vendor: "Acme",
    productType: "Kitchen",
    status: "ACTIVE",
    lastSyncedAt: now,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    images: [
      { id: "img-1", productId: "product-1", shopifyImageId: "gid1", url: "https://cdn/1.jpg", altText: "Mug", position: 0, createdAt: now },
      { id: "img-2", productId: "product-1", shopifyImageId: "gid2", url: "https://cdn/2.jpg", altText: null, position: 1, createdAt: now },
    ],
    variants: [
      {
        id: "variant-1",
        productId: "product-1",
        shopifyVariantId: "v1",
        title: "Small",
        sku: "MUG-S",
        price: new Prisma.Decimal("9.99"),
        compareAtPrice: new Prisma.Decimal("12.00"),
        inventoryQuantity: 5,
        selectedOptions: [{ name: "Size", value: "Small" }],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "variant-2",
        productId: "product-1",
        shopifyVariantId: "v2",
        title: "Large",
        sku: null,
        price: new Prisma.Decimal("14.99"),
        compareAtPrice: null,
        inventoryQuantity: null,
        selectedOptions: [{ name: "Size", value: "Large" }],
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  } as ProductWithRelations;
}

describe("toProductListResponse", () => {
  it("maps a product to its summary shape, using the lowest-position image as featured", () => {
    const response = toProductListResponse([makeProduct()], "next-cursor");

    expect(response.nextCursor).toBe("next-cursor");
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: "product-1",
      title: "Mug",
      featuredImage: { id: "img-1", url: "https://cdn/1.jpg" },
      priceRange: { min: "9.99", max: "14.99" },
      variantCount: 2,
    });
  });

  it("returns a null featuredImage and priceRange for a product with no images/variants", () => {
    const response = toProductListResponse([makeProduct({ images: [], variants: [] })], null);
    expect(response.items[0]?.featuredImage).toBeNull();
    expect(response.items[0]?.priceRange).toBeNull();
    expect(response.items[0]?.variantCount).toBe(0);
  });

  it("never leaks raw Prisma Decimal instances into the response", () => {
    const response = toProductListResponse([makeProduct()], null);
    expect(typeof response.items[0]?.priceRange?.min).toBe("string");
  });
});

describe("toProductDetailResponse", () => {
  it("includes the full image and variant lists, not just the featured image", () => {
    const response = toProductDetailResponse(makeProduct());
    expect(response.product.images).toHaveLength(2);
    expect(response.product.variants).toHaveLength(2);
    expect(response.product.variants[0]).toMatchObject({
      price: "9.99",
      // Prisma's Decimal (decimal.js) normalizes trailing zeros on toString().
      compareAtPrice: "12",
      selectedOptions: [{ name: "Size", value: "Small" }],
    });
    expect(response.product.variants[1]?.compareAtPrice).toBeNull();
  });
});

describe("toProductSyncResponse", () => {
  it("passes sync counters through unchanged", () => {
    const response = toProductSyncResponse({
      productsSeen: 5,
      productsCreated: 2,
      productsUpdated: 3,
      productsDeactivated: 1,
    });
    expect(response).toEqual({ productsSeen: 5, productsCreated: 2, productsUpdated: 3, productsDeactivated: 1 });
  });
});
