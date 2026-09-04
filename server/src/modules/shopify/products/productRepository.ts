import { prisma } from "../../../db/prisma.js";
import type { Prisma, Product, ProductImage, Variant } from "../../../../prisma/generated/index.js";
import type { NormalizedProduct } from "./types.js";

export type ProductWithRelations = Product & { images: ProductImage[]; variants: Variant[] };

const WITH_RELATIONS = {
  images: { orderBy: { position: "asc" as const } },
  variants: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ProductInclude;

/**
 * Upserts a product and replaces its variant/image sets to match the given
 * normalized snapshot. Variants and images are themselves upserted (keyed by
 * their own Shopify id), not deleted-and-recreated, so their internal ids
 * stay stable across repeated syncs; only rows no longer present in the
 * snapshot are removed. Idempotent: running this twice with the same
 * `normalized` input leaves the database in the same state.
 */
export async function upsertProduct(
  shopId: string,
  normalized: NormalizedProduct,
): Promise<{ product: ProductWithRelations; wasCreated: boolean }> {
  const existing = await prisma.product.findUnique({
    where: { shopId_shopifyProductId: { shopId, shopifyProductId: normalized.shopifyProductId } },
    select: { id: true },
  });

  const product = await prisma.$transaction(async (tx) => {
    const saved = await tx.product.upsert({
      where: { shopId_shopifyProductId: { shopId, shopifyProductId: normalized.shopifyProductId } },
      create: {
        shopId,
        shopifyProductId: normalized.shopifyProductId,
        title: normalized.title,
        handle: normalized.handle,
        description: normalized.description,
        vendor: normalized.vendor,
        productType: normalized.productType,
        status: normalized.status,
        lastSyncedAt: new Date(),
        deletedAt: null,
      },
      update: {
        title: normalized.title,
        handle: normalized.handle,
        description: normalized.description,
        vendor: normalized.vendor,
        productType: normalized.productType,
        status: normalized.status,
        lastSyncedAt: new Date(),
        deletedAt: null,
      },
    });

    for (const variant of normalized.variants) {
      await tx.variant.upsert({
        where: { productId_shopifyVariantId: { productId: saved.id, shopifyVariantId: variant.shopifyVariantId } },
        create: {
          productId: saved.id,
          shopifyVariantId: variant.shopifyVariantId,
          title: variant.title,
          sku: variant.sku,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          inventoryQuantity: variant.inventoryQuantity,
          selectedOptions: variant.selectedOptions as unknown as Prisma.InputJsonValue,
        },
        update: {
          title: variant.title,
          sku: variant.sku,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          inventoryQuantity: variant.inventoryQuantity,
          selectedOptions: variant.selectedOptions as unknown as Prisma.InputJsonValue,
        },
      });
    }
    await tx.variant.deleteMany({
      where: {
        productId: saved.id,
        shopifyVariantId: { notIn: normalized.variants.map((v) => v.shopifyVariantId) },
      },
    });

    for (const image of normalized.images) {
      await tx.productImage.upsert({
        where: { productId_shopifyImageId: { productId: saved.id, shopifyImageId: image.shopifyImageId } },
        create: {
          productId: saved.id,
          shopifyImageId: image.shopifyImageId,
          url: image.url,
          altText: image.altText,
          position: image.position,
        },
        update: {
          url: image.url,
          altText: image.altText,
          position: image.position,
        },
      });
    }
    await tx.productImage.deleteMany({
      where: {
        productId: saved.id,
        shopifyImageId: { notIn: normalized.images.map((i) => i.shopifyImageId) },
      },
    });

    return tx.product.findUniqueOrThrow({ where: { id: saved.id }, include: WITH_RELATIONS });
  });

  return { product, wasCreated: existing === null };
}

export interface ProductListPage {
  items: ProductWithRelations[];
  nextCursor: string | null;
}

/** Lists non-deleted products for exactly one shop — the tenant boundary is always shopId, never a client-supplied value. */
export async function findProductsByShop(
  shopId: string,
  options: { cursor?: string; limit: number },
): Promise<ProductListPage> {
  const items = await prisma.product.findMany({
    where: { shopId, deletedAt: null },
    include: WITH_RELATIONS,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > options.limit;
  const page = hasMore ? items.slice(0, options.limit) : items;

  return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

/** Returns a single product only if it belongs to the given shop — a product id from another shop resolves to null, same as "not found." */
export function findProductByIdForShop(shopId: string, productId: string): Promise<ProductWithRelations | null> {
  return prisma.product.findFirst({
    where: { id: productId, shopId, deletedAt: null },
    include: WITH_RELATIONS,
  });
}

/** Soft-deletes (by Shopify product id) scoped to one shop — used by the products/delete webhook. */
export async function markProductDeletedByShopifyId(shopId: string, shopifyProductId: string): Promise<void> {
  await prisma.product.updateMany({
    where: { shopId, shopifyProductId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Marks any non-deleted product for this shop whose Shopify id was not seen
 * in the most recent full sync as deleted — covers products removed from
 * Shopify without (or before) a delivered `products/delete` webhook. Returns
 * the number of products deactivated.
 */
export async function deactivateProductsNotIn(shopId: string, seenShopifyProductIds: string[]): Promise<number> {
  const result = await prisma.product.updateMany({
    where: { shopId, deletedAt: null, shopifyProductId: { notIn: seenShopifyProductIds } },
    data: { deletedAt: new Date() },
  });
  return result.count;
}
