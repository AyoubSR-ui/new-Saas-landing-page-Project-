import {
  ProductDetailResponseSchema,
  ProductListResponseSchema,
  ProductSyncResponseSchema,
  type ProductDetail,
  type ProductDetailResponse,
  type ProductImage as ProductImageContract,
  type ProductListResponse,
  type ProductSummary,
  type ProductSyncResponse,
  type ProductVariant as ProductVariantContract,
} from "@ecommerce-landing-saas/shared";
import type { ProductWithRelations } from "./productRepository.js";
import type { SyncResult } from "./productSync.js";

function toFeaturedImage(product: ProductWithRelations): ProductImageContract | null {
  const [first] = product.images;
  return first
    ? { id: first.id, url: first.url, altText: first.altText, position: first.position }
    : null;
}

function toPriceRange(product: ProductWithRelations): { min: string; max: string } | null {
  if (product.variants.length === 0) {
    return null;
  }
  let min = product.variants[0]!.price;
  let max = product.variants[0]!.price;
  for (const variant of product.variants) {
    if (variant.price.lessThan(min)) min = variant.price;
    if (variant.price.greaterThan(max)) max = variant.price;
  }
  return { min: min.toString(), max: max.toString() };
}

function toSummary(product: ProductWithRelations): ProductSummary {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    vendor: product.vendor,
    productType: product.productType,
    featuredImage: toFeaturedImage(product),
    priceRange: toPriceRange(product),
    variantCount: product.variants.length,
    updatedAt: product.updatedAt.toISOString(),
    lastSyncedAt: product.lastSyncedAt ? product.lastSyncedAt.toISOString() : null,
  };
}

function toVariantContract(variant: ProductWithRelations["variants"][number]): ProductVariantContract {
  const selectedOptions = Array.isArray(variant.selectedOptions)
    ? (variant.selectedOptions as { name: string; value: string }[])
    : [];

  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    price: variant.price.toString(),
    compareAtPrice: variant.compareAtPrice ? variant.compareAtPrice.toString() : null,
    inventoryQuantity: variant.inventoryQuantity,
    selectedOptions,
  };
}

function toDetail(product: ProductWithRelations): ProductDetail {
  return {
    ...toSummary(product),
    description: product.description,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.altText,
      position: image.position,
    })),
    variants: product.variants.map(toVariantContract),
  };
}

export function toProductListResponse(items: ProductWithRelations[], nextCursor: string | null): ProductListResponse {
  return ProductListResponseSchema.parse({
    items: items.map(toSummary),
    nextCursor,
  });
}

export function toProductDetailResponse(product: ProductWithRelations): ProductDetailResponse {
  return ProductDetailResponseSchema.parse({ product: toDetail(product) });
}

export function toProductSyncResponse(result: SyncResult): ProductSyncResponse {
  return ProductSyncResponseSchema.parse(result);
}
