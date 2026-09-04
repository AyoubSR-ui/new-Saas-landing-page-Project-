import { toShopifyGid } from "./types.js";
import type { NormalizedProduct, NormalizedProductStatus, NormalizedSelectedOption, NormalizedVariant, NormalizedProductImage } from "./types.js";

// Shopify webhook deliveries carry the classic REST resource JSON — a
// different shape from the GraphQL nodes used for sync (numeric ids,
// snake_case fields, per-variant option1/2/3 rather than a selectedOptions
// array). This adapter normalizes that shape into the same NormalizedProduct
// used by the GraphQL path, so both feed one persistence layer.

export class WebhookProductPayloadError extends Error {
  constructor(message = "Malformed Shopify product webhook payload") {
    super(message);
    this.name = "WebhookProductPayloadError";
  }
}

interface RestImage {
  id: unknown;
  src: unknown;
  alt: unknown;
  position: unknown;
}

interface RestVariant {
  id: unknown;
  title: unknown;
  sku: unknown;
  price: unknown;
  compare_at_price: unknown;
  inventory_quantity: unknown;
  option1: unknown;
  option2: unknown;
  option3: unknown;
}

interface RestOption {
  name: unknown;
}

interface RestProductPayload {
  id: unknown;
  title: unknown;
  handle: unknown;
  body_html: unknown;
  vendor: unknown;
  product_type: unknown;
  status: unknown;
  images: unknown;
  variants: unknown;
  options: unknown;
}

const VALID_STATUSES: readonly NormalizedProductStatus[] = ["ACTIVE", "ARCHIVED", "DRAFT"];

function normalizeStatus(raw: unknown): NormalizedProductStatus {
  const upper = typeof raw === "string" ? raw.toUpperCase() : "";
  return (VALID_STATUSES as readonly string[]).includes(upper) ? (upper as NormalizedProductStatus) : "DRAFT";
}

function normalizeImages(raw: unknown): NormalizedProductImage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry, index): NormalizedProductImage | null => {
      const image = entry as RestImage;
      if (typeof image?.id !== "number" && typeof image?.id !== "string") return null;
      if (typeof image?.src !== "string") return null;
      const position = typeof image.position === "number" ? image.position - 1 : index;
      return {
        shopifyImageId: toShopifyGid("ProductImage", image.id),
        url: image.src,
        altText: typeof image.alt === "string" && image.alt.length > 0 ? image.alt : null,
        position: position >= 0 ? position : index,
      };
    })
    .filter((img): img is NormalizedProductImage => img !== null);
}

function buildSelectedOptions(optionNames: string[], variant: RestVariant): NormalizedSelectedOption[] {
  const values = [variant.option1, variant.option2, variant.option3];
  const options: NormalizedSelectedOption[] = [];
  optionNames.forEach((name, index) => {
    const value = values[index];
    if (typeof value === "string" && value.length > 0) {
      options.push({ name, value });
    }
  });
  return options;
}

function normalizeVariants(raw: unknown, optionNames: string[]): NormalizedVariant[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry): NormalizedVariant | null => {
      const variant = entry as RestVariant;
      if (typeof variant?.id !== "number" && typeof variant?.id !== "string") return null;
      if (typeof variant?.price !== "string" && typeof variant?.price !== "number") return null;

      return {
        shopifyVariantId: toShopifyGid("ProductVariant", variant.id),
        title: typeof variant.title === "string" && variant.title.length > 0 ? variant.title : "Default Title",
        sku: typeof variant.sku === "string" && variant.sku.length > 0 ? variant.sku : null,
        price: String(variant.price),
        compareAtPrice:
          typeof variant.compare_at_price === "string" || typeof variant.compare_at_price === "number"
            ? String(variant.compare_at_price)
            : null,
        inventoryQuantity: typeof variant.inventory_quantity === "number" ? variant.inventory_quantity : null,
        selectedOptions: buildSelectedOptions(optionNames, variant),
      };
    })
    .filter((variant): variant is NormalizedVariant => variant !== null);
}

/** Normalizes a `products/create` or `products/update` webhook payload. */
export function normalizeWebhookProduct(payload: unknown): NormalizedProduct {
  const product = payload as RestProductPayload;

  if (
    (typeof product?.id !== "number" && typeof product?.id !== "string") ||
    typeof product?.title !== "string" ||
    typeof product?.handle !== "string"
  ) {
    throw new WebhookProductPayloadError();
  }

  const optionNames = Array.isArray(product.options)
    ? product.options
        .map((opt) => (opt as RestOption)?.name)
        .filter((name): name is string => typeof name === "string")
    : [];

  return {
    shopifyProductId: toShopifyGid("Product", product.id),
    title: product.title,
    handle: product.handle,
    description: typeof product.body_html === "string" && product.body_html.length > 0 ? product.body_html : null,
    vendor: typeof product.vendor === "string" && product.vendor.length > 0 ? product.vendor : null,
    productType: typeof product.product_type === "string" && product.product_type.length > 0 ? product.product_type : null,
    status: normalizeStatus(product.status),
    images: normalizeImages(product.images),
    variants: normalizeVariants(product.variants, optionNames),
  };
}

/** Normalizes a `products/delete` webhook payload, which carries only the deleted product's id. */
export function normalizeWebhookProductId(payload: unknown): string {
  const product = payload as { id: unknown };
  if (typeof product?.id !== "number" && typeof product?.id !== "string") {
    throw new WebhookProductPayloadError();
  }
  return toShopifyGid("Product", product.id);
}
