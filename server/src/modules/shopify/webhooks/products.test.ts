import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const API_SECRET = "test-api-secret";
const SHOP = "my-shop.myshopify.com";
const OTHER_SHOP = "other-shop.myshopify.com";

interface MockShop {
  id: string;
  shopDomain: string;
  status: "INSTALLED" | "UNINSTALLED";
}

const db = vi.hoisted(() => ({
  shops: new Map<string, MockShop>(),
  upsertCalls: [] as { shopId: string; shopifyProductId: string }[],
  deleteCalls: [] as { shopId: string; shopifyProductId: string }[],
}));

vi.mock("../db/shopRepository.js", () => ({
  findShopByDomain: vi.fn(async (shopDomain: string) => db.shops.get(shopDomain) ?? null),
}));

vi.mock("../products/productRepository.js", () => ({
  upsertProduct: vi.fn(async (shopId: string, normalized: { shopifyProductId: string }) => {
    db.upsertCalls.push({ shopId, shopifyProductId: normalized.shopifyProductId });
    return { product: {}, wasCreated: true };
  }),
  markProductDeletedByShopifyId: vi.fn(async (shopId: string, shopifyProductId: string) => {
    db.deleteCalls.push({ shopId, shopifyProductId });
  }),
}));

const { createApp } = await import("../../../app.js");

function signWebhookBody(body: object): { text: string; hmac: string } {
  const text = JSON.stringify(body);
  const hmac = createHmac("sha256", API_SECRET).update(Buffer.from(text)).digest("base64");
  return { text, hmac };
}

const PRODUCT_PAYLOAD = {
  id: 123,
  title: "Mug",
  handle: "mug",
  body_html: "",
  vendor: "",
  product_type: "",
  status: "active",
  options: [],
  images: [],
  variants: [
    { id: 1, title: "Default Title", sku: null, price: "9.99", compare_at_price: null, inventory_quantity: 1 },
  ],
};

describe("product webhooks", () => {
  beforeEach(() => {
    db.shops.clear();
    db.upsertCalls = [];
    db.deleteCalls = [];
    db.shops.set(SHOP, { id: "shop-1", shopDomain: SHOP, status: "INSTALLED" });
    db.shops.set(OTHER_SHOP, { id: "shop-2", shopDomain: OTHER_SHOP, status: "INSTALLED" });
  });

  for (const path of ["/api/shopify/webhooks/products-create", "/api/shopify/webhooks/products-update"]) {
    describe(`POST ${path}`, () => {
      it("upserts the product for the verified shop", async () => {
        const app = createApp();
        const { text, hmac } = signWebhookBody(PRODUCT_PAYLOAD);

        const res = await request(app)
          .post(path)
          .set("X-Shopify-Hmac-Sha256", hmac)
          .set("X-Shopify-Shop-Domain", SHOP)
          .set("Content-Type", "application/json")
          .send(text);

        expect(res.status).toBe(200);
        expect(db.upsertCalls).toEqual([{ shopId: "shop-1", shopifyProductId: "gid://shopify/Product/123" }]);
      });

      it("rejects an invalid HMAC signature", async () => {
        const app = createApp();
        const { text } = signWebhookBody(PRODUCT_PAYLOAD);

        const res = await request(app)
          .post(path)
          .set("X-Shopify-Hmac-Sha256", "clearly-invalid")
          .set("X-Shopify-Shop-Domain", SHOP)
          .set("Content-Type", "application/json")
          .send(text);

        expect(res.status).toBe(401);
        expect(db.upsertCalls).toEqual([]);
      });

      it("acknowledges but does nothing for an unknown shop", async () => {
        const app = createApp();
        const { text, hmac } = signWebhookBody(PRODUCT_PAYLOAD);

        const res = await request(app)
          .post(path)
          .set("X-Shopify-Hmac-Sha256", hmac)
          .set("X-Shopify-Shop-Domain", "never-installed.myshopify.com")
          .set("Content-Type", "application/json")
          .send(text);

        expect(res.status).toBe(200);
        expect(db.upsertCalls).toEqual([]);
      });

      it("acknowledges but ignores a malformed payload", async () => {
        const app = createApp();
        const { text, hmac } = signWebhookBody({ not: "a product" });

        const res = await request(app)
          .post(path)
          .set("X-Shopify-Hmac-Sha256", hmac)
          .set("X-Shopify-Shop-Domain", SHOP)
          .set("Content-Type", "application/json")
          .send(text);

        expect(res.status).toBe(200);
        expect(db.upsertCalls).toEqual([]);
      });

      it("is idempotent: repeated delivery of the same webhook upserts each time without erroring", async () => {
        const app = createApp();
        const { text, hmac } = signWebhookBody(PRODUCT_PAYLOAD);

        for (let i = 0; i < 2; i++) {
          const res = await request(app)
            .post(path)
            .set("X-Shopify-Hmac-Sha256", hmac)
            .set("X-Shopify-Shop-Domain", SHOP)
            .set("Content-Type", "application/json")
            .send(text);
          expect(res.status).toBe(200);
        }

        expect(db.upsertCalls).toHaveLength(2);
      });

      it("scopes the upsert to the shop identified by the verified webhook, never a different shop", async () => {
        const app = createApp();
        const { text, hmac } = signWebhookBody(PRODUCT_PAYLOAD);

        await request(app)
          .post(path)
          .set("X-Shopify-Hmac-Sha256", hmac)
          .set("X-Shopify-Shop-Domain", OTHER_SHOP)
          .set("Content-Type", "application/json")
          .send(text);

        expect(db.upsertCalls).toEqual([{ shopId: "shop-2", shopifyProductId: "gid://shopify/Product/123" }]);
      });
    });
  }

  describe("POST /api/shopify/webhooks/products-delete", () => {
    it("marks the product deleted for the verified shop", async () => {
      const app = createApp();
      const { text, hmac } = signWebhookBody({ id: 123 });

      const res = await request(app)
        .post("/api/shopify/webhooks/products-delete")
        .set("X-Shopify-Hmac-Sha256", hmac)
        .set("X-Shopify-Shop-Domain", SHOP)
        .set("Content-Type", "application/json")
        .send(text);

      expect(res.status).toBe(200);
      expect(db.deleteCalls).toEqual([{ shopId: "shop-1", shopifyProductId: "gid://shopify/Product/123" }]);
    });

    it("rejects an invalid HMAC signature", async () => {
      const app = createApp();
      const { text } = signWebhookBody({ id: 123 });

      const res = await request(app)
        .post("/api/shopify/webhooks/products-delete")
        .set("X-Shopify-Hmac-Sha256", "bad-signature")
        .set("X-Shopify-Shop-Domain", SHOP)
        .set("Content-Type", "application/json")
        .send(text);

      expect(res.status).toBe(401);
      expect(db.deleteCalls).toEqual([]);
    });

    it("rejects a malformed X-Shopify-Shop-Domain header", async () => {
      const app = createApp();
      const { text, hmac } = signWebhookBody({ id: 123 });

      const res = await request(app)
        .post("/api/shopify/webhooks/products-delete")
        .set("X-Shopify-Hmac-Sha256", hmac)
        .set("Content-Type", "application/json")
        .send(text);

      expect(res.status).toBe(400);
    });

    it("is idempotent: a repeated delete webhook stays a no-op success", async () => {
      const app = createApp();
      const { text, hmac } = signWebhookBody({ id: 123 });

      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post("/api/shopify/webhooks/products-delete")
          .set("X-Shopify-Hmac-Sha256", hmac)
          .set("X-Shopify-Shop-Domain", SHOP)
          .set("Content-Type", "application/json")
          .send(text);
        expect(res.status).toBe(200);
      }

      expect(db.deleteCalls).toHaveLength(2);
    });
  });
});
