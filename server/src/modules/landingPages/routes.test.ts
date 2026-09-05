import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE_DOCUMENT } from "@ecommerce-landing-saas/shared";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";

const API_SECRET = "test-api-secret";
const API_KEY = "test-api-key";
const SHOP_A = "shop-a.myshopify.com";
const SHOP_B = "shop-b.myshopify.com";
const UNINSTALLED_SHOP = "uninstalled.myshopify.com";

const shops = vi.hoisted(
  () =>
    new Map<string, { id: string; shopDomain: string; status: "INSTALLED" | "UNINSTALLED" }>([
      ["shop-a.myshopify.com", { id: "shop-a", shopDomain: "shop-a.myshopify.com", status: "INSTALLED" }],
      ["shop-b.myshopify.com", { id: "shop-b", shopDomain: "shop-b.myshopify.com", status: "INSTALLED" }],
      ["uninstalled.myshopify.com", { id: "shop-uninstalled", shopDomain: "uninstalled.myshopify.com", status: "UNINSTALLED" }],
    ]),
);

vi.mock("../shopify/db/shopRepository.js", () => ({
  findShopByDomain: vi.fn(async (shopDomain: string) => shops.get(shopDomain) ?? null),
}));

const service = vi.hoisted(() => ({
  createLandingPage: vi.fn(),
  listLandingPages: vi.fn(),
  getLandingPage: vi.fn(),
  updateLandingPage: vi.fn(),
  deleteLandingPage: vi.fn(),
}));

vi.mock("./landingPageService.js", () => service);

const { createApp } = await import("../../app.js");

function sessionToken(shop: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: API_KEY, sub: "1", exp: now + 60, nbf: now - 5, iat: now },
    API_SECRET,
    { algorithm: "HS256" },
  );
}

function fakePage(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "page-1",
    shopId: "shop-a",
    title: "Title",
    slug: "title",
    status: "DRAFT",
    config: DEFAULT_PAGE_DOCUMENT,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    productLinks: [],
    ...overrides,
  };
}

describe("landing page API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/landing-pages", () => {
    it("rejects an unauthenticated request", async () => {
      const app = createApp();
      const res = await request(app).get("/api/landing-pages");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    });

    it("lists pages for the authenticated shop", async () => {
      service.listLandingPages.mockResolvedValue({ items: [fakePage()], nextCursor: null });
      const app = createApp();
      const res = await request(app).get("/api/landing-pages").set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(service.listLandingPages).toHaveBeenCalledWith("shop-a", expect.objectContaining({ limit: 20 }));
      expect(res.body.items).toHaveLength(1);
    });

    it("rejects an invalid limit query parameter", async () => {
      const app = createApp();
      const res = await request(app)
        .get("/api/landing-pages")
        .query({ limit: "not-a-number" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    });

    it("rejects a request from an uninstalled shop", async () => {
      const app = createApp();
      const res = await request(app)
        .get("/api/landing-pages")
        .set("Authorization", `Bearer ${sessionToken(UNINSTALLED_SHOP)}`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/landing-pages/:id", () => {
    it("returns a page belonging to the authenticated shop", async () => {
      service.getLandingPage.mockResolvedValue(fakePage());
      const app = createApp();
      const res = await request(app).get("/api/landing-pages/page-1").set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(200);
      expect(res.body.landingPage.id).toBe("page-1");
    });

    it("returns not-found (via the service) for a page belonging to a different shop", async () => {
      service.getLandingPage.mockRejectedValue(new NotFoundError("Landing page not found"));
      const app = createApp();
      const res = await request(app).get("/api/landing-pages/page-1").set("Authorization", `Bearer ${sessionToken(SHOP_B)}`);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
    });

    it("passes the authenticated shop id, never a client-supplied one, to the service", async () => {
      service.getLandingPage.mockResolvedValue(fakePage());
      const app = createApp();
      await request(app)
        .get("/api/landing-pages/page-1")
        .query({ shopId: "shop-b" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(service.getLandingPage).toHaveBeenCalledWith("shop-a", "page-1");
    });
  });

  describe("POST /api/landing-pages", () => {
    it("creates a page for the authenticated shop, ignoring a client-supplied shopId", async () => {
      service.createLandingPage.mockResolvedValue(fakePage());
      const app = createApp();
      const res = await request(app)
        .post("/api/landing-pages")
        .send({ title: "New Page", shopId: "shop-b" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(201);
      expect(service.createLandingPage).toHaveBeenCalledWith("shop-a", expect.objectContaining({ title: "New Page" }));
    });

    it("rejects a request missing a title", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/landing-pages")
        .send({})
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
      expect(service.createLandingPage).not.toHaveBeenCalled();
    });

    it("rejects an invalid slug", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/landing-pages")
        .send({ title: "Page", slug: "Not A Valid Slug!" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
    });

    it("surfaces a slug conflict as 409", async () => {
      service.createLandingPage.mockRejectedValue(new ConflictError('Slug "dup" is already in use for this shop'));
      const app = createApp();
      const res = await request(app)
        .post("/api/landing-pages")
        .send({ title: "Page", slug: "dup" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: { code: "CONFLICT" } });
    });

    it("surfaces a cross-tenant product association as a validation error", async () => {
      service.createLandingPage.mockRejectedValue(new ValidationError("Product p1 is not a valid product for this shop"));
      const app = createApp();
      const res = await request(app)
        .post("/api/landing-pages")
        .send({ title: "Page", productIds: ["p1"] })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
    });

    it("rejects an unauthenticated request", async () => {
      const app = createApp();
      const res = await request(app).post("/api/landing-pages").send({ title: "Page" });
      expect(res.status).toBe(401);
      expect(service.createLandingPage).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/landing-pages/:id", () => {
    it("updates a page belonging to the authenticated shop", async () => {
      service.updateLandingPage.mockResolvedValue(fakePage({ title: "Updated" }));
      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({ title: "Updated" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(service.updateLandingPage).toHaveBeenCalledWith("shop-a", "page-1", expect.objectContaining({ title: "Updated" }));
    });

    it("saves a valid page document (editor save) and returns it unchanged", async () => {
      const document = {
        schemaVersion: 2,
        sections: [{ id: "hero-1", type: "hero", props: { headline: "Big Sale" }, settings: { padding: "medium" } }],
        metadata: { migrationNotes: [] },
      };
      service.updateLandingPage.mockResolvedValue(fakePage({ config: document }));

      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({ config: document })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(200);
      expect(service.updateLandingPage).toHaveBeenCalledWith(
        "shop-a",
        "page-1",
        expect.objectContaining({ config: expect.objectContaining({ schemaVersion: 2 }) }),
      );
    });

    it("rejects a malformed page document (unknown section type)", async () => {
      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({ config: { schemaVersion: 2, sections: [{ id: "s1", type: "carousel", props: {} }], metadata: {} } })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
      expect(service.updateLandingPage).not.toHaveBeenCalled();
    });

    it("rejects a page document with an invalid (old) schema version", async () => {
      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({ config: { version: 1, sections: [] } })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(400);
      expect(service.updateLandingPage).not.toHaveBeenCalled();
    });

    it("surfaces a cross-tenant product reference inside a product_showcase section as a validation error", async () => {
      service.updateLandingPage.mockRejectedValue(new ValidationError("Product p1 is not a valid product for this shop"));
      const document = {
        schemaVersion: 2,
        sections: [{ id: "ps-1", type: "product_showcase", props: { productIds: ["p1"] }, settings: { padding: "medium" } }],
        metadata: { migrationNotes: [] },
      };

      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({ config: document })
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);

      expect(res.status).toBe(400);
    });

    it("returns not-found for a page belonging to another shop", async () => {
      service.updateLandingPage.mockRejectedValue(new NotFoundError("Landing page not found"));
      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({ title: "Updated" })
        .set("Authorization", `Bearer ${sessionToken(SHOP_B)}`);
      expect(res.status).toBe(404);
    });

    it("rejects an empty patch body", async () => {
      const app = createApp();
      const res = await request(app)
        .patch("/api/landing-pages/page-1")
        .send({})
        .set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(400);
      expect(service.updateLandingPage).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request", async () => {
      const app = createApp();
      const res = await request(app).patch("/api/landing-pages/page-1").send({ title: "x" });
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/landing-pages/:id", () => {
    it("deletes a page belonging to the authenticated shop", async () => {
      service.deleteLandingPage.mockResolvedValue(undefined);
      const app = createApp();
      const res = await request(app).delete("/api/landing-pages/page-1").set("Authorization", `Bearer ${sessionToken(SHOP_A)}`);
      expect(res.status).toBe(204);
      expect(service.deleteLandingPage).toHaveBeenCalledWith("shop-a", "page-1");
    });

    it("returns not-found when deleting a page belonging to another shop", async () => {
      service.deleteLandingPage.mockRejectedValue(new NotFoundError("Landing page not found"));
      const app = createApp();
      const res = await request(app).delete("/api/landing-pages/page-1").set("Authorization", `Bearer ${sessionToken(SHOP_B)}`);
      expect(res.status).toBe(404);
    });

    it("rejects an unauthenticated request", async () => {
      const app = createApp();
      const res = await request(app).delete("/api/landing-pages/page-1");
      expect(res.status).toBe(401);
      expect(service.deleteLandingPage).not.toHaveBeenCalled();
    });
  });
});
