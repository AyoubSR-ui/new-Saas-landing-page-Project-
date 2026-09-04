import { createHmac } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const API_SECRET = "test-api-secret";
const SHOP = "my-shop.myshopify.com";

interface MockShop {
  id: string;
  shopDomain: string;
  accessTokenCiphertext: string | null;
  scopes: string | null;
  status: "INSTALLED" | "UNINSTALLED";
}

const db = vi.hoisted(() => ({
  states: new Map<string, { state: string; shopDomain: string; expiresAt: Date }>(),
  shops: new Map<string, MockShop>(),
}));

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    oAuthState: {
      create: vi.fn(async ({ data }: { data: { state: string; shopDomain: string; expiresAt: Date } }) => {
        db.states.set(data.state, data);
        return { id: "state-id", ...data, createdAt: new Date() };
      }),
      findUnique: vi.fn(async ({ where }: { where: { state: string } }) => {
        const record = db.states.get(where.state);
        return record ? { id: "state-id", ...record, createdAt: new Date() } : null;
      }),
      delete: vi.fn(async ({ where }: { where: { state: string } }) => {
        db.states.delete(where.state);
      }),
    },
    shop: {
      findUnique: vi.fn(async ({ where }: { where: { shopDomain: string } }) => db.shops.get(where.shopDomain) ?? null),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { shopDomain: string };
          create: Omit<MockShop, "id">;
          update: Partial<MockShop>;
        }) => {
          const existing = db.shops.get(where.shopDomain);
          const record: MockShop = existing
            ? { ...existing, ...update }
            : { id: `shop-${db.shops.size + 1}`, ...create };
          db.shops.set(where.shopDomain, record);
          return record;
        },
      ),
    },
  },
}));

const { createApp } = await import("../../../app.js");

function signOAuthHmac(params: Record<string, string>): string {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHmac("sha256", API_SECRET).update(message).digest("hex");
}

async function startInstall(app: ReturnType<typeof createApp>, shop = SHOP) {
  const res = await request(app).get("/api/shopify/auth").query({ shop });
  const location = new URL(res.headers.location as string);
  const state = location.searchParams.get("state") as string;
  return { res, state };
}

describe("GET /api/shopify/auth", () => {
  beforeEach(() => {
    db.states.clear();
    db.shops.clear();
  });

  it("redirects to Shopify's authorize endpoint with a generated state", async () => {
    const app = createApp();
    const res = await request(app).get("/api/shopify/auth").query({ shop: SHOP });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin).toBe(`https://${SHOP}`);
    expect(location.pathname).toBe("/admin/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-api-key");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(db.states.size).toBe(1);
  });

  it("rejects an invalid shop domain", async () => {
    const app = createApp();
    const res = await request(app).get("/api/shopify/auth").query({ shop: "not-a-shop" });

    expect(res.status).toBe(400);
    expect(db.states.size).toBe(0);
  });

  it("rejects a missing shop parameter", async () => {
    const app = createApp();
    const res = await request(app).get("/api/shopify/auth");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/shopify/auth/callback", () => {
  beforeEach(() => {
    db.states.clear();
    db.shops.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("completes installation on a fully valid callback", async () => {
    const app = createApp();
    const { state } = await startInstall(app);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: "shpat_real_token", scope: "read_products" }), {
          status: 200,
        }),
      ),
    );

    const params = { shop: SHOP, code: "auth-code-123", state, timestamp: "1000" };
    const hmac = signOAuthHmac(params);

    const res = await request(app).get("/api/shopify/auth/callback").query({ ...params, hmac });

    expect(res.status).toBe(302);
    const redirect = new URL(res.headers.location as string);
    expect(redirect.origin).toBe("https://app.test.example");
    expect(redirect.searchParams.get("shop")).toBe(SHOP);

    const stored = db.shops.get(SHOP);
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("INSTALLED");
    expect(stored?.accessTokenCiphertext).toBeTruthy();
    expect(stored?.accessTokenCiphertext).not.toContain("shpat_real_token");
    expect(stored?.scopes).toBe("read_products");

    // State must be single-use.
    expect(db.states.has(state)).toBe(false);
  });

  it("rejects a callback with an invalid HMAC signature", async () => {
    const app = createApp();
    const { state } = await startInstall(app);

    const params = { shop: SHOP, code: "auth-code-123", state };
    const res = await request(app)
      .get("/api/shopify/auth/callback")
      .query({ ...params, hmac: "0".repeat(64) });

    expect(res.status).toBe(401);
    expect(db.shops.has(SHOP)).toBe(false);
  });

  it("rejects a callback with an invalid/expired state", async () => {
    const app = createApp();
    const params = { shop: SHOP, code: "auth-code-123", state: "never-issued-state" };
    const hmac = signOAuthHmac(params);

    const res = await request(app).get("/api/shopify/auth/callback").query({ ...params, hmac });

    expect(res.status).toBe(403);
    expect(db.shops.has(SHOP)).toBe(false);
  });

  it("rejects a callback missing required parameters", async () => {
    const app = createApp();
    const res = await request(app).get("/api/shopify/auth/callback").query({ shop: SHOP });

    expect(res.status).toBe(400);
  });

  it("rejects a callback for an invalid shop domain even with a matching-looking state", async () => {
    const app = createApp();
    const params = { shop: "not-a-shop", code: "auth-code-123", state: "irrelevant" };
    const hmac = signOAuthHmac(params);

    const res = await request(app).get("/api/shopify/auth/callback").query({ ...params, hmac });

    expect(res.status).toBe(400);
  });

  it("returns a gateway error and does not persist a shop when token exchange fails", async () => {
    const app = createApp();
    const { state } = await startInstall(app);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 500 })),
    );

    const params = { shop: SHOP, code: "auth-code-123", state };
    const hmac = signOAuthHmac(params);

    const res = await request(app).get("/api/shopify/auth/callback").query({ ...params, hmac });

    expect(res.status).toBe(502);
    expect(db.shops.has(SHOP)).toBe(false);
  });
});
