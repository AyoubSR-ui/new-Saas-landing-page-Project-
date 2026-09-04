import { z } from "zod";

export const ProductStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ProductImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  altText: z.string().nullable(),
  position: z.number().int(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const ProductVariantOptionSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const ProductVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  price: z.string(),
  compareAtPrice: z.string().nullable(),
  inventoryQuantity: z.number().int().nullable(),
  selectedOptions: z.array(ProductVariantOptionSchema),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const PriceRangeSchema = z.object({
  min: z.string(),
  max: z.string(),
});
export type PriceRange = z.infer<typeof PriceRangeSchema>;

export const ProductSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  status: ProductStatusSchema,
  vendor: z.string().nullable(),
  productType: z.string().nullable(),
  featuredImage: ProductImageSchema.nullable(),
  priceRange: PriceRangeSchema.nullable(),
  variantCount: z.number().int(),
  updatedAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime().nullable(),
});
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

export const ProductDetailSchema = ProductSummarySchema.extend({
  description: z.string().nullable(),
  images: z.array(ProductImageSchema),
  variants: z.array(ProductVariantSchema),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

export const ProductListResponseSchema = z.object({
  items: z.array(ProductSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

export const ProductDetailResponseSchema = z.object({
  product: ProductDetailSchema,
});
export type ProductDetailResponse = z.infer<typeof ProductDetailResponseSchema>;

export const ProductSyncResponseSchema = z.object({
  productsSeen: z.number().int(),
  productsCreated: z.number().int(),
  productsUpdated: z.number().int(),
  productsDeactivated: z.number().int(),
});
export type ProductSyncResponse = z.infer<typeof ProductSyncResponseSchema>;
