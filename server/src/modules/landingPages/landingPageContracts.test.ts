import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_DOCUMENT } from "@ecommerce-landing-saas/shared";
import { toLandingPageDetailResponse, toLandingPageListResponse } from "./landingPageContracts.js";
import type { LandingPageWithDocument } from "./landingPageService.js";

function makePage(overrides: Partial<LandingPageWithDocument> = {}): LandingPageWithDocument {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "page-1",
    shopId: "shop-1",
    title: "My Page",
    slug: "my-page",
    status: "DRAFT",
    config: DEFAULT_PAGE_DOCUMENT,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    productLinks: [
      {
        id: "link-1",
        landingPageId: "page-1",
        productId: "product-1",
        position: 0,
        createdAt: now,
        product: {
          id: "product-1",
          shopId: "shop-1",
          shopifyProductId: "gid://shopify/Product/1",
          title: "Mug",
          handle: "mug",
          description: null,
          vendor: null,
          productType: null,
          status: "ACTIVE",
          lastSyncedAt: now,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          images: [{ id: "img-1", productId: "product-1", shopifyImageId: "gid1", url: "https://cdn/1.jpg", altText: "Mug", position: 0, createdAt: now }],
        },
      },
    ],
    ...overrides,
  } as LandingPageWithDocument;
}

describe("toLandingPageListResponse", () => {
  it("maps a page to its summary shape with a product count", () => {
    const response = toLandingPageListResponse([makePage()], "next-cursor");
    expect(response.nextCursor).toBe("next-cursor");
    expect(response.items[0]).toMatchObject({ id: "page-1", title: "My Page", slug: "my-page", productCount: 1 });
  });

  it("handles a page with no product associations", () => {
    const response = toLandingPageListResponse([makePage({ productLinks: [] })], null);
    expect(response.items[0]?.productCount).toBe(0);
  });
});

describe("toLandingPageDetailResponse", () => {
  it("includes the full config and product references", () => {
    const response = toLandingPageDetailResponse(makePage());
    expect(response.landingPage.config).toEqual(DEFAULT_PAGE_DOCUMENT);
    expect(response.landingPage.products).toHaveLength(1);
    expect(response.landingPage.products[0]).toMatchObject({
      id: "product-1",
      title: "Mug",
      featuredImage: { id: "img-1", url: "https://cdn/1.jpg" },
    });
  });

  it("returns a null featuredImage for an associated product with no images", () => {
    const page = makePage();
    page.productLinks[0]!.product.images = [];
    const response = toLandingPageDetailResponse(page);
    expect(response.landingPage.products[0]?.featuredImage).toBeNull();
  });

  it("passes a document containing sections through unchanged (contracts.ts does no section-specific mapping)", () => {
    const documentWithSections = {
      schemaVersion: 2 as const,
      sections: [{ id: "h1", type: "hero" as const, props: { headline: "Hi", alignment: "center" as const }, settings: { padding: "medium" as const } }],
      metadata: { migrationNotes: [] },
    };
    const response = toLandingPageDetailResponse(makePage({ config: documentWithSections }));
    expect(response.landingPage.config).toEqual(documentWithSections);
  });
});
