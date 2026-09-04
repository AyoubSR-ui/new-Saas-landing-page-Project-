import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING_PAGE_CONFIG } from "@ecommerce-landing-saas/shared";
import { prisma } from "../../db/prisma.js";
import { Prisma } from "../../../prisma/generated/index.js";
import { encryptToken } from "../shopify/security/tokenCipher.js";
import {
  createLandingPage,
  findLandingPageByIdForShop,
  findLandingPagesByShop,
  softDeleteLandingPage,
  updateLandingPage,
} from "./landingPageRepository.js";

// Prisma's InputJsonValue doesn't structurally accept our shared LandingPageConfig
// type (its `props: Record<string, unknown>` isn't assignable to InputJsonObject) —
// the repository/service layers cast at the boundary for the same reason; this test
// data does the same.
const config = DEFAULT_LANDING_PAGE_CONFIG as unknown as Prisma.InputJsonValue;

// Real-database verification (no mocks) for the Phase 3 landing-page data
// layer, mirroring the Phase 1/2 self-skip pattern: this suite only runs
// against a reachable PostgreSQL instance and reports a clear skip reason
// otherwise, rather than pretending to pass.
let dbAvailable = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbAvailable = true;
} catch {
  console.warn(
    "[landingPageRepository.integration.test] Skipping: no reachable PostgreSQL at " +
      `${process.env.DATABASE_URL ?? "(DATABASE_URL unset)"}. ` +
      "Start a real Postgres and re-run tests to exercise the real database path.",
  );
}

async function createShop(suffix: string): Promise<{ id: string }> {
  const shop = await prisma.shop.create({
    data: {
      shopDomain: `landing-page-test-${suffix}-${Date.now()}.myshopify.com`,
      accessTokenCiphertext: encryptToken("shpat_x"),
      scopes: "read_products",
      status: "INSTALLED",
    },
  });
  return { id: shop.id };
}

async function createProduct(shopId: string, suffix: string): Promise<{ id: string }> {
  const product = await prisma.product.create({
    data: {
      shopId,
      shopifyProductId: `gid://shopify/Product/${suffix}-${Date.now()}`,
      title: `Product ${suffix}`,
      handle: `product-${suffix}`,
      status: "ACTIVE",
    },
  });
  return { id: product.id };
}

describe.runIf(dbAvailable)("landingPageRepository (real database)", () => {
  it("creates a landing page with default config", async () => {
    const shop = await createShop("create");
    const page = await createLandingPage(shop.id, {
      title: "My Page",
      slug: "my-page",
      config,
      productIds: [],
    });

    expect(page.title).toBe("My Page");
    expect(page.status).toBe("DRAFT");
    expect(page.config).toEqual(DEFAULT_LANDING_PAGE_CONFIG);
    expect(page.productLinks).toEqual([]);
  });

  it("reads a page back by id, scoped to its shop", async () => {
    const shop = await createShop("read");
    const created = await createLandingPage(shop.id, {
      title: "Readable",
      slug: "readable",
      config,
      productIds: [],
    });

    const found = await findLandingPageByIdForShop(shop.id, created.id);
    expect(found?.id).toBe(created.id);
  });

  it("updates title, status, and config", async () => {
    const shop = await createShop("update");
    const created = await createLandingPage(shop.id, {
      title: "Original",
      slug: "original",
      config,
      productIds: [],
    });

    const updated = await updateLandingPage(shop.id, created.id, {
      title: "Renamed",
      status: "PUBLISHED",
      config: { version: 1, sections: [{ id: "s1", type: "hero", props: {} }] } as unknown as Prisma.InputJsonValue,
    });

    expect(updated?.title).toBe("Renamed");
    expect(updated?.status).toBe("PUBLISHED");
    expect(updated?.config).toEqual({ version: 1, sections: [{ id: "s1", type: "hero", props: {} }] });
  });

  it("soft-deletes a page and excludes it from listings and lookups", async () => {
    const shop = await createShop("delete");
    const created = await createLandingPage(shop.id, {
      title: "To Delete",
      slug: "to-delete",
      config,
      productIds: [],
    });

    const deleted = await softDeleteLandingPage(shop.id, created.id);
    expect(deleted).toBe(true);

    expect(await findLandingPageByIdForShop(shop.id, created.id)).toBeNull();
    const stillThere = await prisma.landingPage.findUnique({ where: { id: created.id } });
    expect(stillThere?.deletedAt).not.toBeNull();
  });

  it("enforces slug uniqueness within a shop", async () => {
    const shop = await createShop("unique-slug");
    await createLandingPage(shop.id, { title: "First", slug: "dup", config, productIds: [] });

    await expect(
      createLandingPage(shop.id, { title: "Second", slug: "dup", config, productIds: [] }),
    ).rejects.toThrow();
  });

  it("allows the same slug to be reused across different shops", async () => {
    const shopA = await createShop("slug-a");
    const shopB = await createShop("slug-b");

    await expect(
      createLandingPage(shopA.id, { title: "Page", slug: "shared-slug", config, productIds: [] }),
    ).resolves.toBeDefined();
    await expect(
      createLandingPage(shopB.id, { title: "Page", slug: "shared-slug", config, productIds: [] }),
    ).resolves.toBeDefined();
  });

  it("scopes pages strictly by shop — one shop can never read another shop's page", async () => {
    const shopA = await createShop("isolation-a");
    const shopB = await createShop("isolation-b");
    const pageA = await createLandingPage(shopA.id, {
      title: "A's page",
      slug: "as-page",
      config,
      productIds: [],
    });

    expect(await findLandingPageByIdForShop(shopB.id, pageA.id)).toBeNull();
    expect(await updateLandingPage(shopB.id, pageA.id, { title: "Hijacked" })).toBeNull();
    expect(await softDeleteLandingPage(shopB.id, pageA.id)).toBe(false);

    const shopAList = await findLandingPagesByShop(shopA.id, { limit: 20 });
    expect(shopAList.items.map((p) => p.id)).toEqual([pageA.id]);
  });

  it("associates a product with a page and persists ordering", async () => {
    const shop = await createShop("product-assoc");
    const productA = await createProduct(shop.id, "a");
    const productB = await createProduct(shop.id, "b");

    const page = await createLandingPage(shop.id, {
      title: "With products",
      slug: "with-products",
      config,
      productIds: [productA.id, productB.id],
    });

    expect(page.productLinks).toHaveLength(2);
    expect(page.productLinks.map((link) => link.productId)).toEqual([productA.id, productB.id]);
  });

  it("prevents duplicate associations of the same product to one page", async () => {
    const shop = await createShop("dup-product");
    const product = await createProduct(shop.id, "dup");
    const page = await createLandingPage(shop.id, {
      title: "Page",
      slug: "page",
      config,
      productIds: [product.id],
    });

    await expect(
      prisma.landingPageProduct.create({ data: { landingPageId: page.id, productId: product.id, position: 1 } }),
    ).rejects.toThrow();
  });

  it("the repository itself does not enforce cross-shop product ownership — that is the service layer's job (landingPageService.ts)", async () => {
    const shopA = await createShop("cross-a");
    const shopB = await createShop("cross-b");
    const productOfShopB = await createProduct(shopB.id, "foreign");

    // The repository has no way to know productOfShopB belongs to a
    // different shop than shopA — and, by design, does not try. This is why
    // landingPageService.createLandingPage validates every productId via
    // Phase 2's shop-scoped findProductByIdForShop *before* ever calling
    // into this repository (see landingPageService.test.ts).
    const page = await createLandingPage(shopA.id, {
      title: "Should never happen via the API",
      slug: "unsafe",
      config,
      productIds: [productOfShopB.id],
    });

    expect(page.productLinks[0]?.productId).toBe(productOfShopB.id);
  });

  it("updateLandingPage replaces product associations, preserving still-present rows and pruning removed ones", async () => {
    const shop = await createShop("replace-products");
    const productA = await createProduct(shop.id, "a");
    const productB = await createProduct(shop.id, "b");
    const page = await createLandingPage(shop.id, {
      title: "Page",
      slug: "replace",
      config,
      productIds: [productA.id],
    });

    const updated = await updateLandingPage(shop.id, page.id, { productIds: [productB.id] });

    expect(updated?.productLinks).toHaveLength(1);
    expect(updated?.productLinks[0]?.productId).toBe(productB.id);
  });
});
