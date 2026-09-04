import { describe, expect, it } from "vitest";
import { prisma } from "../../../db/prisma.js";
import { encryptToken } from "../security/tokenCipher.js";
import {
  deactivateProductsNotIn,
  findProductByIdForShop,
  findProductsByShop,
  markProductDeletedByShopifyId,
  upsertProduct,
} from "./productRepository.js";
import type { NormalizedProduct } from "./types.js";

// Real-database verification (no mocks) for the Phase 2 product data layer,
// mirroring shopRepository.integration.test.ts's self-skip pattern: this
// suite only runs against a reachable PostgreSQL instance and reports a
// clear skip reason otherwise, rather than pretending to pass.
let dbAvailable = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbAvailable = true;
} catch {
  console.warn(
    "[productRepository.integration.test] Skipping: no reachable PostgreSQL at " +
      `${process.env.DATABASE_URL ?? "(DATABASE_URL unset)"}. ` +
      "Start a real Postgres and re-run tests to exercise the real database path.",
  );
}

async function createShop(suffix: string): Promise<{ id: string; shopDomain: string }> {
  const shopDomain = `product-repo-test-${suffix}-${Date.now()}.myshopify.com`;
  const shop = await prisma.shop.create({
    data: { shopDomain, accessTokenCiphertext: encryptToken("shpat_x"), scopes: "read_products", status: "INSTALLED" },
  });
  return { id: shop.id, shopDomain: shop.shopDomain };
}

function product(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    shopifyProductId: "gid://shopify/Product/1",
    title: "Mug",
    handle: "mug",
    description: null,
    vendor: null,
    productType: null,
    status: "ACTIVE",
    images: [],
    variants: [],
    ...overrides,
  };
}

describe.runIf(dbAvailable)("productRepository (real database)", () => {
  it("creates a product with variants and images", async () => {
    const shop = await createShop("create");

    const { product: saved, wasCreated } = await upsertProduct(
      shop.id,
      product({
        variants: [
          {
            shopifyVariantId: "gid://shopify/ProductVariant/1",
            title: "Default",
            sku: "SKU-1",
            price: "9.99",
            compareAtPrice: null,
            inventoryQuantity: 3,
            selectedOptions: [],
          },
        ],
        images: [{ shopifyImageId: "gid://shopify/ProductImage/1", url: "https://cdn/1.jpg", altText: null, position: 0 }],
      }),
    );

    expect(wasCreated).toBe(true);
    expect(saved.variants).toHaveLength(1);
    expect(saved.images).toHaveLength(1);
    expect(saved.variants[0]?.price.toString()).toBe("9.99");
  });

  it("upserts idempotently: running twice with unchanged data does not duplicate rows", async () => {
    const shop = await createShop("idempotent");
    const normalized = product({
      variants: [
        {
          shopifyVariantId: "gid://shopify/ProductVariant/1",
          title: "Default",
          sku: "SKU-1",
          price: "9.99",
          compareAtPrice: null,
          inventoryQuantity: 3,
          selectedOptions: [],
        },
      ],
      images: [{ shopifyImageId: "gid://shopify/ProductImage/1", url: "https://cdn/1.jpg", altText: null, position: 0 }],
    });

    const first = await upsertProduct(shop.id, normalized);
    const second = await upsertProduct(shop.id, normalized);

    expect(first.wasCreated).toBe(true);
    expect(second.wasCreated).toBe(false);
    expect(first.product.id).toBe(second.product.id);

    const products = await prisma.product.findMany({ where: { shopId: shop.id } });
    expect(products).toHaveLength(1);
    const variants = await prisma.variant.findMany({ where: { productId: first.product.id } });
    expect(variants).toHaveLength(1);
  });

  it("updates fields and replaces variants/images on a changed re-sync, without creating duplicates", async () => {
    const shop = await createShop("update");
    const first = await upsertProduct(
      shop.id,
      product({
        title: "Old Title",
        variants: [
          {
            shopifyVariantId: "gid://shopify/ProductVariant/1",
            title: "Only Variant",
            sku: null,
            price: "5.00",
            compareAtPrice: null,
            inventoryQuantity: null,
            selectedOptions: [],
          },
        ],
      }),
    );

    const second = await upsertProduct(
      shop.id,
      product({
        title: "New Title",
        variants: [
          {
            shopifyVariantId: "gid://shopify/ProductVariant/2",
            title: "Replacement Variant",
            sku: null,
            price: "7.00",
            compareAtPrice: null,
            inventoryQuantity: null,
            selectedOptions: [],
          },
        ],
      }),
    );

    expect(second.product.id).toBe(first.product.id);
    expect(second.product.title).toBe("New Title");
    expect(second.product.variants).toHaveLength(1);
    expect(second.product.variants[0]?.shopifyVariantId).toBe("gid://shopify/ProductVariant/2");

    const remainingVariants = await prisma.variant.findMany({ where: { productId: first.product.id } });
    expect(remainingVariants).toHaveLength(1);
  });

  it("enforces a unique Shopify product id within a shop", async () => {
    const shop = await createShop("unique-product");
    await upsertProduct(shop.id, product());

    await expect(
      prisma.product.create({
        data: {
          shopId: shop.id,
          shopifyProductId: "gid://shopify/Product/1",
          title: "Duplicate",
          handle: "duplicate",
          status: "ACTIVE",
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces a unique Shopify variant id within a product/shop", async () => {
    const shop = await createShop("unique-variant");
    const { product: saved } = await upsertProduct(
      shop.id,
      product({
        variants: [
          {
            shopifyVariantId: "gid://shopify/ProductVariant/1",
            title: "Default",
            sku: null,
            price: "1.00",
            compareAtPrice: null,
            inventoryQuantity: null,
            selectedOptions: [],
          },
        ],
      }),
    );

    await expect(
      prisma.variant.create({
        data: {
          productId: saved.id,
          shopifyVariantId: "gid://shopify/ProductVariant/1",
          title: "Duplicate",
          price: "2.00",
        },
      }),
    ).rejects.toThrow();
  });

  it("scopes products strictly by shop — one shop can never read another shop's product", async () => {
    const shopA = await createShop("isolation-a");
    const shopB = await createShop("isolation-b");

    const { product: productA } = await upsertProduct(shopA.id, product());
    await upsertProduct(shopB.id, product());

    const crossShopLookup = await findProductByIdForShop(shopB.id, productA.id);
    expect(crossShopLookup).toBeNull();

    const shopAList = await findProductsByShop(shopA.id, { limit: 20 });
    expect(shopAList.items.map((p) => p.id)).toEqual([productA.id]);
  });

  it("soft-deletes a product by Shopify id, scoped to the owning shop, and excludes it from listings", async () => {
    const shop = await createShop("delete");
    const { product: saved } = await upsertProduct(shop.id, product());

    await markProductDeletedByShopifyId(shop.id, saved.shopifyProductId);

    const found = await findProductByIdForShop(shop.id, saved.id);
    expect(found).toBeNull();

    const stillThere = await prisma.product.findUnique({ where: { id: saved.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.deletedAt).not.toBeNull();
  });

  it("deactivates only products not seen in the latest sync, scoped to the shop", async () => {
    const shop = await createShop("deactivate");
    const { product: kept } = await upsertProduct(shop.id, product({ shopifyProductId: "gid://shopify/Product/keep" }));
    const { product: removed } = await upsertProduct(
      shop.id,
      product({ shopifyProductId: "gid://shopify/Product/remove" }),
    );

    const count = await deactivateProductsNotIn(shop.id, [kept.shopifyProductId]);

    expect(count).toBe(1);
    expect(await findProductByIdForShop(shop.id, kept.id)).not.toBeNull();
    expect(await findProductByIdForShop(shop.id, removed.id)).toBeNull();
  });

  it("stamps lastSyncedAt on every upsert", async () => {
    const shop = await createShop("timestamps");
    const before = new Date();
    const { product: saved } = await upsertProduct(shop.id, product());
    expect(saved.lastSyncedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
