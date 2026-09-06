import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const API_SECRET = "test-api-secret";
const API_KEY = "test-api-key";
const SHOP_A = "shop-a.myshopify.com";
const SHOP_B = "shop-b.myshopify.com";
const UNINSTALLED_SHOP = "uninstalled.myshopify.com";

interface MockShop {
  id: string;
  shopDomain: string;
  status: "INSTALLED" | "UNINSTALLED";
}

interface MockProduct {
  id: string;
  shopId: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  vendor: string | null;
  productType: string | null;
  description: string | null;
  images: never[];
  variants: never[];
  updatedAt: Date;
  lastSyncedAt: Date;
  createdAt: Date;
}

const db = vi.hoisted(() => ({
  shops: new Map<string, MockShop>([
    ["shop-a", { id: "shop-a", shopDomain: "shop-a.myshopify.com", status: "INSTALLED" as const }],
    ["shop-b", { id: "shop-b", shopDomain: "shop-b.myshopify.com", status: "INSTALLED" as const }],
    ["uninstalled", { id: "shop-uninstalled", shopDomain: "uninstalled.myshopify.com", status: "UNINSTALLED" as const }],
  ]),
  products: new Map<string, MockProduct>(),
  syncCalls: [] as { id: string; shopDomain: string }[],
}));

vi.mock("../db/shopRepository.js", () => ({
  findShopByDomain: vi.fn(async (shopDomain: string) => {
    for (const shop of db.shops.values()) {
      if (shop.shopDomain === shopDomain) return shop;
    }
    return null;
  }),
}));

vi.mock("./productRepository.js", () => ({
  findProductsByShop: vi.fn(async (shopId: string, _opts: { cursor?: string; limit: number }) => {
    const items = [...db.products.values()].filter((p) => p.shopId === shopId);
    return { items, nextCursor: null };
  }),
  findProductByIdForShop: vi.fn(async (shopId: string, productId: string) => {
    const product = db.products.get(productId);
    return product && product.shopId === shopId ? product : null;
  }),
}));

vi.mock("./productSync.js", () => ({
  syncShopProducts: vi.fn(async (shop: { id: string; shopDomain: string }) => {
    db.syncCalls.push(shop);
    return { productsSeen: 1, productsCreated: 1, productsUpdated: 0, productsDeactivated: 0 };
  }),
}));

const { createApp } = await import("../../../app.js");
const { syncShopProducts } = await import("./productSync.js");
const { ShopifyApiError, ShopNotInstalledError } = await import("../client/shopifyClient.js");
const { ShopifyProductAdapterError } = await import("./shopifyProductAdapter.js");
const { TokenDecryptionError } = await import("../security/tokenCipher.js");

function sessionToken(shop: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: API_KEY, sub: "1", exp: now + 60, nbf: now - 5, iat: now },
    API_SECRET,
    { algorithm: "HS256" },
  );
}

function makeProduct(id: string, shopId: string): MockProduct {
  const now = new Date();
  return {
    id,
    shopId,
    title: `Product ${id}`,
    handle: id,
    status: "ACTIVE",
    vendor: null,
    productType: null,
    description: null,
    images: [],
    variants: [],
    updatedAt: now,
    lastSyncedAt: now,
    createdAt: now,
  };
}

describe("product API routes", () => {
  beforeEach(() => {
    db.products.clear();
    db.syncCalls = [];
  });

  describe("GET /api/products", () => {
    it("rejects an unauthenticated request", async () => {
      const app = createApp();
      const res = await request(app).get("/api/products");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    });

    it("returns only the authenticated shop's products", async () => {
      db.products.set("p1", makeProduct("p1", "shop-a"));
      db.products.set("p2", makeProduct("p2", "shop-b"));

      const app = createApp();
      const res = await request(app).get("/api/products").set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe("p1");
    });

    it("cannot be redirected to another shop's products via a client-supplied shop query parameter", async () => {
      db.products.set("p1", makeProduct("p1", "shop-a"));
      db.products.set("p2", makeProduct("p2", "shop-b"));

      const app = createApp();
      const res = await request(app)
        .get("/api/products")
        .query({ shop: SHOP_B, shopId: "shop-b" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(res.body.items.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    });

    it("rejects a request from an uninstalled shop", async () => {
      const app = createApp();
      const res = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${sessionToken(UNINSTALLED_SHOP)}`);
      expect(res.status).toBe(403);
    });

    it("rejects an invalid limit query parameter", async () => {
      const app = createApp();
      const res = await request(app)
        .get("/api/products")
        .query({ limit: "not-a-number" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    });

    it("rejects a limit above the maximum page size", async () => {
      const app = createApp();
      const res = await request(app)
        .get("/api/products")
        .query({ limit: "9999" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/products/:id", () => {
    it("returns a product belonging to the authenticated shop", async () => {
      db.products.set("p1", makeProduct("p1", "shop-a"));

      const app = createApp();
      const res = await request(app).get("/api/products/p1").set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(res.body.product.id).toBe("p1");
    });

    it("returns not-found for a product belonging to a different shop", async () => {
      db.products.set("p1", makeProduct("p1", "shop-b"));

      const app = createApp();
      const res = await request(app).get("/api/products/p1").set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
    });

    it("returns not-found for a product id that does not exist", async () => {
      const app = createApp();
      const res = await request(app)
        .get("/api/products/does-not-exist")
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(404);
    });

    it("rejects an unauthenticated request", async () => {
      const app = createApp();
      const res = await request(app).get("/api/products/p1");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/products/sync", () => {
    it("triggers a sync scoped to the authenticated shop only, ignoring any client-supplied shop id", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/products/sync")
        .send({ shopId: "shop-b", shop: SHOP_B })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(db.syncCalls).toEqual([{ id: "shop-a", shopDomain: SHOP_A }]);
      expect(res.body).toMatchObject({ productsSeen: 1, productsCreated: 1 });
    });

    it("rejects an unauthenticated sync request", async () => {
      const app = createApp();
      const res = await request(app).post("/api/products/sync");
      expect(res.status).toBe(401);
      expect(db.syncCalls).toEqual([]);
    });

    it("rejects a sync request from an uninstalled shop", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/products/sync")
        .set("Authorization", `Bearer ${sessionToken(UNINSTALLED_SHOP)}`);
      expect(res.status).toBe(403);
      expect(db.syncCalls).toEqual([]);
    });

    // These map the sync pipeline's own error types to real HTTP status
    // codes/messages instead of the generic 500 errorHandler previously gave
    // for all of them (none extended AppError). Regression coverage for the
    // production incident where a missing OAuth scope surfaced only as an
    // opaque "Internal server error".
    describe("error mapping", () => {
      it("maps ShopNotInstalledError to 403 SHOP_NOT_INSTALLED", async () => {
        vi.mocked(syncShopProducts).mockRejectedValueOnce(new ShopNotInstalledError(SHOP_A));

        const app = createApp();
        const res = await request(app)
          .post("/api/products/sync")
          .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ error: { code: "SHOP_NOT_INSTALLED" } });
      });

      it("maps a Shopify API/GraphQL failure to 502 SHOPIFY_API_ERROR carrying the real message", async () => {
        vi.mocked(syncShopProducts).mockRejectedValueOnce(
          new ShopifyApiError(
            "Shopify GraphQL product query returned errors: Access denied for products field.",
            200,
          ),
        );

        const app = createApp();
        const res = await request(app)
          .post("/api/products/sync")
          .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

        expect(res.status).toBe(502);
        expect(res.body.error.code).toBe("SHOPIFY_API_ERROR");
        expect(res.body.error.message).toContain("Access denied for products field");
      });

      it("maps an unexpected Shopify response shape to 502 SHOPIFY_SYNC_ERROR", async () => {
        vi.mocked(syncShopProducts).mockRejectedValueOnce(
          new ShopifyProductAdapterError("Shopify product response is missing required fields"),
        );

        const app = createApp();
        const res = await request(app)
          .post("/api/products/sync")
          .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

        expect(res.status).toBe(502);
        expect(res.body.error.code).toBe("SHOPIFY_SYNC_ERROR");
      });

      it("maps a token decryption failure to 500 TOKEN_DECRYPTION_ERROR without leaking ciphertext", async () => {
        vi.mocked(syncShopProducts).mockRejectedValueOnce(new TokenDecryptionError());

        const app = createApp();
        const res = await request(app)
          .post("/api/products/sync")
          .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe("TOKEN_DECRYPTION_ERROR");
        expect(JSON.stringify(res.body)).not.toMatch(/v1\./);
      });

      it("still falls back to a generic 500 for a truly unrecognized error", async () => {
        vi.mocked(syncShopProducts).mockRejectedValueOnce(new Error("boom"));

        const app = createApp();
        const res = await request(app)
          .post("/api/products/sync")
          .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe("INTERNAL_ERROR");
      });
    });
  });
});
