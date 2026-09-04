import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const API_SECRET = "test-api-secret";
const SHOP = "my-shop.myshopify.com";

interface MockShop {
  id: string;
  shopDomain: string;
  accessTokenCiphertext: string | null;
  scopes: string | null;
  status: "INSTALLED" | "UNINSTALLED";
  uninstalledAt: Date | null;
}

const shops = vi.hoisted(() => new Map<string, MockShop>());

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(async ({ where }: { where: { shopDomain: string } }) => shops.get(where.shopDomain) ?? null),
      update: vi.fn(async ({ where, data }: { where: { shopDomain: string }; data: Partial<MockShop> }) => {
        const existing = shops.get(where.shopDomain);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        shops.set(where.shopDomain, updated);
        return updated;
      }),
    },
  },
}));

const { createApp } = await import("../../../app.js");

// supertest/superagent re-serializes a Buffer body under Content-Type
// application/json (wrapping it as {type:"Buffer",data:[...]}), which would
// silently break byte-exact HMAC verification. Sending the raw JSON text as
// a *string* keeps the exact bytes on the wire, matching what the server's
// `verify` callback captures into req.rawBody.
function signWebhookBody(body: object): { text: string; hmac: string } {
  const text = JSON.stringify(body);
  const hmac = createHmac("sha256", API_SECRET).update(Buffer.from(text)).digest("base64");
  return { text, hmac };
}

describe("POST /api/shopify/webhooks/app-uninstalled", () => {
  beforeEach(() => {
    shops.clear();
    shops.set(SHOP, {
      id: "shop-1",
      shopDomain: SHOP,
      accessTokenCiphertext: "v1.iv.tag.ciphertext",
      scopes: "read_products",
      status: "INSTALLED",
      uninstalledAt: null,
    });
  });

  it("marks an installed shop uninstalled on a valid webhook", async () => {
    const app = createApp();
    const { text, hmac } = signWebhookBody({ id: 1, domain: SHOP });

    const res = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", hmac)
      .set("X-Shopify-Shop-Domain", SHOP)
      .set("Content-Type", "application/json")
      .send(text);

    expect(res.status).toBe(200);
    const stored = shops.get(SHOP);
    expect(stored?.status).toBe("UNINSTALLED");
    expect(stored?.uninstalledAt).not.toBeNull();
    // Token can no longer be used, even at the data layer.
    expect(stored?.accessTokenCiphertext).toBeNull();
  });

  it("rejects a webhook with an invalid HMAC signature", async () => {
    const app = createApp();
    const { text } = signWebhookBody({ id: 1, domain: SHOP });

    const res = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", "clearly-invalid-signature")
      .set("X-Shopify-Shop-Domain", SHOP)
      .set("Content-Type", "application/json")
      .send(text);

    expect(res.status).toBe(401);
    expect(shops.get(SHOP)?.status).toBe("INSTALLED");
  });

  it("rejects a webhook whose body was tampered with after signing", async () => {
    const app = createApp();
    const { hmac } = signWebhookBody({ id: 1, domain: SHOP });
    const tamperedText = JSON.stringify({ id: 999, domain: SHOP });

    const res = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", hmac)
      .set("X-Shopify-Shop-Domain", SHOP)
      .set("Content-Type", "application/json")
      .send(tamperedText);

    expect(res.status).toBe(401);
    expect(shops.get(SHOP)?.status).toBe("INSTALLED");
  });

  it("rejects a malformed webhook missing the shop domain header", async () => {
    const app = createApp();
    const { text, hmac } = signWebhookBody({ id: 1 });

    const res = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", hmac)
      .set("Content-Type", "application/json")
      .send(text);

    expect(res.status).toBe(400);
  });

  it("is idempotent: a repeated valid webhook for an already-uninstalled shop stays a no-op success", async () => {
    const app = createApp();
    const { text, hmac } = signWebhookBody({ id: 1, domain: SHOP });

    const first = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", hmac)
      .set("X-Shopify-Shop-Domain", SHOP)
      .set("Content-Type", "application/json")
      .send(text);
    expect(first.status).toBe(200);

    const uninstalledAtAfterFirst = shops.get(SHOP)?.uninstalledAt;

    const second = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", hmac)
      .set("X-Shopify-Shop-Domain", SHOP)
      .set("Content-Type", "application/json")
      .send(text);

    expect(second.status).toBe(200);
    expect(shops.get(SHOP)?.status).toBe("UNINSTALLED");
    expect(shops.get(SHOP)?.uninstalledAt).toEqual(uninstalledAtAfterFirst);
  });

  it("returns 200 for a valid webhook about a shop with no local record (nothing to do)", async () => {
    const app = createApp();
    const unknownShop = "never-installed.myshopify.com";
    const { text, hmac } = signWebhookBody({ id: 1, domain: unknownShop });

    const res = await request(app)
      .post("/api/shopify/webhooks/app-uninstalled")
      .set("X-Shopify-Hmac-Sha256", hmac)
      .set("X-Shopify-Shop-Domain", unknownShop)
      .set("Content-Type", "application/json")
      .send(text);

    expect(res.status).toBe(200);
  });
});
