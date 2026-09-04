import { describe, expect, it } from "vitest";
import {
  normalizeWebhookProduct,
  normalizeWebhookProductId,
  WebhookProductPayloadError,
} from "./webhookProductAdapter.js";

const BASE_PRODUCT = {
  id: 123456789,
  title: "Classic Tee",
  handle: "classic-tee",
  body_html: "<p>A tee.</p>",
  vendor: "Acme",
  product_type: "Apparel",
  status: "active",
  options: [{ name: "Size" }, { name: "Color" }],
  images: [
    { id: 111, src: "https://cdn.example/1.jpg", alt: "Front", position: 1 },
    { id: 222, src: "https://cdn.example/2.jpg", alt: null, position: 2 },
  ],
  variants: [
    {
      id: 555,
      title: "Small / Red",
      sku: "TEE-S-RED",
      price: "19.99",
      compare_at_price: "24.99",
      inventory_quantity: 10,
      option1: "Small",
      option2: "Red",
      option3: null,
    },
  ],
};

describe("normalizeWebhookProduct", () => {
  it("normalizes a full REST webhook payload into the domain shape", () => {
    const result = normalizeWebhookProduct(BASE_PRODUCT);

    expect(result.shopifyProductId).toBe("gid://shopify/Product/123456789");
    expect(result.title).toBe("Classic Tee");
    expect(result.handle).toBe("classic-tee");
    expect(result.description).toBe("<p>A tee.</p>");
    expect(result.vendor).toBe("Acme");
    expect(result.productType).toBe("Apparel");
    expect(result.status).toBe("ACTIVE");

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toMatchObject({
      shopifyImageId: "gid://shopify/ProductImage/111",
      url: "https://cdn.example/1.jpg",
      altText: "Front",
      position: 0,
    });
    expect(result.images[1]?.altText).toBeNull();

    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toMatchObject({
      shopifyVariantId: "gid://shopify/ProductVariant/555",
      title: "Small / Red",
      sku: "TEE-S-RED",
      price: "19.99",
      compareAtPrice: "24.99",
      inventoryQuantity: 10,
      selectedOptions: [
        { name: "Size", value: "Small" },
        { name: "Color", value: "Red" },
      ],
    });
  });

  it("handles a product with no images", () => {
    const result = normalizeWebhookProduct({ ...BASE_PRODUCT, images: [] });
    expect(result.images).toEqual([]);
  });

  it("handles a product with multiple variants", () => {
    const result = normalizeWebhookProduct({
      ...BASE_PRODUCT,
      variants: [
        { ...BASE_PRODUCT.variants[0], id: 1 },
        { ...BASE_PRODUCT.variants[0], id: 2, sku: null, compare_at_price: null },
      ],
    });
    expect(result.variants).toHaveLength(2);
    expect(result.variants[1]?.sku).toBeNull();
    expect(result.variants[1]?.compareAtPrice).toBeNull();
  });

  it("handles an empty description and missing optional fields", () => {
    const result = normalizeWebhookProduct({
      ...BASE_PRODUCT,
      body_html: "",
      vendor: "",
      product_type: null,
      images: [],
      variants: [],
      options: [],
    });
    expect(result.description).toBeNull();
    expect(result.vendor).toBeNull();
    expect(result.productType).toBeNull();
  });

  it("defaults to DRAFT status for an unrecognized status value", () => {
    const result = normalizeWebhookProduct({ ...BASE_PRODUCT, status: "something-unexpected" });
    expect(result.status).toBe("DRAFT");
  });

  it("does not invent values for a missing sku/compare-at-price", () => {
    const result = normalizeWebhookProduct({
      ...BASE_PRODUCT,
      variants: [{ ...BASE_PRODUCT.variants[0], sku: undefined, compare_at_price: undefined }],
    });
    expect(result.variants[0]?.sku).toBeNull();
    expect(result.variants[0]?.compareAtPrice).toBeNull();
  });

  it("throws WebhookProductPayloadError for a payload missing required fields", () => {
    expect(() => normalizeWebhookProduct({ title: "No id" })).toThrow(WebhookProductPayloadError);
  });

  it("throws WebhookProductPayloadError for a non-object payload", () => {
    expect(() => normalizeWebhookProduct(null)).toThrow(WebhookProductPayloadError);
    expect(() => normalizeWebhookProduct("not an object")).toThrow(WebhookProductPayloadError);
  });
});

describe("normalizeWebhookProductId", () => {
  it("extracts and normalizes the id from a products/delete payload", () => {
    expect(normalizeWebhookProductId({ id: 987 })).toBe("gid://shopify/Product/987");
  });

  it("throws WebhookProductPayloadError for a payload with no id", () => {
    expect(() => normalizeWebhookProductId({})).toThrow(WebhookProductPayloadError);
  });
});
