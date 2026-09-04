// Application-owned product representation. Shopify-specific shapes (GraphQL
// nodes, REST webhook payloads) must be converted to this by an adapter
// before touching persistence or the API layer — see shopifyProductAdapter.ts
// (GraphQL sync) and webhookProductAdapter.ts (REST webhooks).

export interface NormalizedProductImage {
  shopifyImageId: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface NormalizedSelectedOption {
  name: string;
  value: string;
}

export interface NormalizedVariant {
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  selectedOptions: NormalizedSelectedOption[];
}

export type NormalizedProductStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";

export interface NormalizedProduct {
  shopifyProductId: string;
  title: string;
  handle: string;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  status: NormalizedProductStatus;
  images: NormalizedProductImage[];
  variants: NormalizedVariant[];
}

/** Shopify's REST resource ids are plain numbers; GraphQL uses a GID string. Normalize both to the same GID so sync (GraphQL) and webhooks (REST) upsert the same row. */
export function toShopifyGid(resource: "Product" | "ProductVariant" | "ProductImage", id: string | number): string {
  const raw = String(id);
  if (raw.startsWith("gid://shopify/")) {
    return raw;
  }
  return `gid://shopify/${resource}/${raw}`;
}
