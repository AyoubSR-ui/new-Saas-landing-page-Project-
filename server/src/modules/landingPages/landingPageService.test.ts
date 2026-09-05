import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE_DOCUMENT } from "@ecommerce-landing-saas/shared";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";

interface MockProduct {
  id: string;
  shopId: string;
}

const state = vi.hoisted(() => ({
  products: new Map<string, MockProduct>(),
}));

vi.mock("../shopify/products/productRepository.js", () => ({
  findProductByIdForShop: vi.fn(async (shopId: string, productId: string) => {
    const product = state.products.get(productId);
    return product && product.shopId === shopId ? product : null;
  }),
}));

const repo = vi.hoisted(() => ({
  createLandingPage: vi.fn(),
  findLandingPagesByShop: vi.fn(),
  findLandingPageByIdForShop: vi.fn(),
  updateLandingPage: vi.fn(),
  softDeleteLandingPage: vi.fn(),
}));

vi.mock("./landingPageRepository.js", () => repo);

const {
  createLandingPage,
  deleteLandingPage,
  getLandingPage,
  listLandingPages,
  updateLandingPage,
} = await import("./landingPageService.js");
const { Prisma } = await import("../../../prisma/generated/index.js");

const SHOP_A = "shop-a";
const SHOP_B = "shop-b";

function fakePage(overrides: Record<string, unknown> = {}) {
  return {
    id: "page-1",
    shopId: SHOP_A,
    title: "Title",
    slug: "title",
    status: "DRAFT",
    config: DEFAULT_PAGE_DOCUMENT,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    productLinks: [],
    ...overrides,
  };
}

function documentWithProductShowcase(productIds: string[]) {
  return {
    schemaVersion: 2 as const,
    sections: [
      {
        id: "showcase-1",
        type: "product_showcase" as const,
        props: { productIds, displayStyle: "grid" as const },
        settings: { padding: "medium" as const },
      },
    ],
    metadata: { migrationNotes: [] },
  };
}

describe("landingPageService", () => {
  beforeEach(() => {
    state.products.clear();
    vi.clearAllMocks();
  });

  describe("createLandingPage", () => {
    it("creates a page with a derived slug when none is provided", async () => {
      repo.createLandingPage.mockResolvedValue(fakePage());

      await createLandingPage(SHOP_A, { title: "My New Page" });

      expect(repo.createLandingPage).toHaveBeenCalledWith(
        SHOP_A,
        expect.objectContaining({ slug: "my-new-page", productIds: [] }),
      );
    });

    it("rejects a product that does not belong to the shop", async () => {
      state.products.set("p1", { id: "p1", shopId: SHOP_B });

      await expect(createLandingPage(SHOP_A, { title: "Page", productIds: ["p1"] })).rejects.toThrow(ValidationError);
      expect(repo.createLandingPage).not.toHaveBeenCalled();
    });

    it("accepts a product that does belong to the shop", async () => {
      state.products.set("p1", { id: "p1", shopId: SHOP_A });
      repo.createLandingPage.mockResolvedValue(fakePage());

      await createLandingPage(SHOP_A, { title: "Page", productIds: ["p1"] });

      expect(repo.createLandingPage).toHaveBeenCalledWith(SHOP_A, expect.objectContaining({ productIds: ["p1"] }));
    });

    it("translates a unique-constraint violation into a ConflictError", async () => {
      repo.createLandingPage.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );

      await expect(createLandingPage(SHOP_A, { title: "Page", slug: "dup" })).rejects.toThrow(ConflictError);
    });

    it("rejects a document whose product_showcase section references a cross-tenant product", async () => {
      state.products.set("p1", { id: "p1", shopId: SHOP_B });

      await expect(
        createLandingPage(SHOP_A, { title: "Page", config: documentWithProductShowcase(["p1"]) }),
      ).rejects.toThrow(ValidationError);
      expect(repo.createLandingPage).not.toHaveBeenCalled();
    });

    it("accepts a document whose product_showcase section references a same-tenant product", async () => {
      state.products.set("p1", { id: "p1", shopId: SHOP_A });
      repo.createLandingPage.mockResolvedValue(fakePage({ config: documentWithProductShowcase(["p1"]) }));

      await createLandingPage(SHOP_A, { title: "Page", config: documentWithProductShowcase(["p1"]) });

      expect(repo.createLandingPage).toHaveBeenCalled();
    });
  });

  describe("getLandingPage", () => {
    it("returns the page when found", async () => {
      repo.findLandingPageByIdForShop.mockResolvedValue(fakePage());
      const page = await getLandingPage(SHOP_A, "page-1");
      expect(page.id).toBe("page-1");
    });

    it("throws NotFoundError when the repository returns null (unknown id or cross-tenant)", async () => {
      repo.findLandingPageByIdForShop.mockResolvedValue(null);
      await expect(getLandingPage(SHOP_A, "page-1")).rejects.toThrow(NotFoundError);
    });

    it("migrates a legacy (v1) stored document to the current schema on read", async () => {
      repo.findLandingPageByIdForShop.mockResolvedValue(
        fakePage({ config: { version: 1, sections: [{ id: "t1", type: "text", props: { body: "Old content" } }] } }),
      );

      const page = await getLandingPage(SHOP_A, "page-1");

      expect(page.config.schemaVersion).toBe(2);
      expect(page.config.sections[0]).toMatchObject({ type: "text", props: { body: "Old content" } });
    });
  });

  describe("listLandingPages", () => {
    it("normalizes every returned item's document", async () => {
      repo.findLandingPagesByShop.mockResolvedValue({
        items: [fakePage({ config: { version: 1, sections: [] } })],
        nextCursor: null,
      });

      const { items } = await listLandingPages(SHOP_A, { limit: 20 });

      expect(items[0]?.config.schemaVersion).toBe(2);
    });
  });

  describe("updateLandingPage", () => {
    it("rejects an update associating a cross-tenant product, without touching the repository", async () => {
      state.products.set("p1", { id: "p1", shopId: SHOP_B });

      await expect(updateLandingPage(SHOP_A, "page-1", { productIds: ["p1"] })).rejects.toThrow(ValidationError);
      expect(repo.updateLandingPage).not.toHaveBeenCalled();
    });

    it("rejects a document update whose product_showcase section references a cross-tenant product", async () => {
      state.products.set("p1", { id: "p1", shopId: SHOP_B });

      await expect(
        updateLandingPage(SHOP_A, "page-1", { config: documentWithProductShowcase(["p1"]) }),
      ).rejects.toThrow(ValidationError);
      expect(repo.updateLandingPage).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when the repository finds no matching row for this shop", async () => {
      repo.updateLandingPage.mockResolvedValue(null);
      await expect(updateLandingPage(SHOP_A, "page-1", { title: "New" })).rejects.toThrow(NotFoundError);
    });

    it("translates a unique-constraint violation into a ConflictError", async () => {
      repo.updateLandingPage.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      await expect(updateLandingPage(SHOP_A, "page-1", { slug: "dup" })).rejects.toThrow(ConflictError);
    });

    it("passes through a successful update", async () => {
      repo.updateLandingPage.mockResolvedValue(fakePage({ title: "Updated" }));
      const page = await updateLandingPage(SHOP_A, "page-1", { title: "Updated" });
      expect(page.title).toBe("Updated");
    });
  });

  describe("deleteLandingPage", () => {
    it("throws NotFoundError when nothing was deleted (unknown id or cross-tenant)", async () => {
      repo.softDeleteLandingPage.mockResolvedValue(false);
      await expect(deleteLandingPage(SHOP_A, "page-1")).rejects.toThrow(NotFoundError);
    });

    it("resolves when the delete succeeds", async () => {
      repo.softDeleteLandingPage.mockResolvedValue(true);
      await expect(deleteLandingPage(SHOP_A, "page-1")).resolves.toBeUndefined();
    });
  });
});
