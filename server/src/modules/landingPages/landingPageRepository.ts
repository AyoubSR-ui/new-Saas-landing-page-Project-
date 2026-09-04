import { prisma } from "../../db/prisma.js";
import type { LandingPage, LandingPageProduct, Prisma, Product, ProductImage } from "../../../prisma/generated/index.js";

export type LandingPageWithProducts = LandingPage & {
  productLinks: (LandingPageProduct & { product: Product & { images: ProductImage[] } })[];
};

const WITH_RELATIONS = {
  productLinks: {
    orderBy: { position: "asc" as const },
    include: {
      product: {
        include: { images: { orderBy: { position: "asc" as const }, take: 1 } },
      },
    },
  },
} satisfies Prisma.LandingPageInclude;

export interface CreateLandingPageData {
  title: string;
  slug: string;
  config: Prisma.InputJsonValue;
  productIds: string[];
}

/** Creates a page and its initial product associations (in order) in one transaction. Throws Prisma's P2002 (unique constraint) on a slug collision — translated to a ConflictError by the service layer. */
export async function createLandingPage(shopId: string, data: CreateLandingPageData): Promise<LandingPageWithProducts> {
  return prisma.$transaction(async (tx) => {
    const page = await tx.landingPage.create({
      data: { shopId, title: data.title, slug: data.slug, config: data.config },
    });

    for (const [index, productId] of data.productIds.entries()) {
      await tx.landingPageProduct.create({
        data: { landingPageId: page.id, productId, position: index },
      });
    }

    return tx.landingPage.findUniqueOrThrow({ where: { id: page.id }, include: WITH_RELATIONS });
  });
}

export interface LandingPageListPage {
  items: LandingPageWithProducts[];
  nextCursor: string | null;
}

/** Lists non-deleted pages for exactly one shop — the tenant boundary is always shopId, never a client-supplied value. */
export async function findLandingPagesByShop(
  shopId: string,
  options: { cursor?: string; limit: number },
): Promise<LandingPageListPage> {
  const items = await prisma.landingPage.findMany({
    where: { shopId, deletedAt: null },
    include: WITH_RELATIONS,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > options.limit;
  const page = hasMore ? items.slice(0, options.limit) : items;

  return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

/** Returns a single page only if it belongs to the given shop — a page id from another shop resolves to null, same as "not found." */
export function findLandingPageByIdForShop(shopId: string, id: string): Promise<LandingPageWithProducts | null> {
  return prisma.landingPage.findFirst({
    where: { id, shopId, deletedAt: null },
    include: WITH_RELATIONS,
  });
}

export interface UpdateLandingPageData {
  title?: string;
  slug?: string;
  status?: "DRAFT" | "PUBLISHED";
  config?: Prisma.InputJsonValue;
  productIds?: string[];
}

/**
 * Updates a page scoped to (id, shopId) — an id belonging to another shop
 * updates zero rows and returns null, never throwing or touching another
 * tenant's data. When `productIds` is provided, associations are upserted
 * by productId and any association no longer present is removed, mirroring
 * the Phase 2 variant/image upsert-and-prune pattern so unrelated
 * associations survive a partial update untouched.
 */
export async function updateLandingPage(
  shopId: string,
  id: string,
  data: UpdateLandingPageData,
): Promise<LandingPageWithProducts | null> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.landingPage.updateMany({
      where: { id, shopId, deletedAt: null },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.config !== undefined ? { config: data.config } : {}),
      },
    });

    if (result.count === 0) {
      return null;
    }

    if (data.productIds !== undefined) {
      for (const [index, productId] of data.productIds.entries()) {
        await tx.landingPageProduct.upsert({
          where: { landingPageId_productId: { landingPageId: id, productId } },
          create: { landingPageId: id, productId, position: index },
          update: { position: index },
        });
      }
      await tx.landingPageProduct.deleteMany({
        where: { landingPageId: id, productId: { notIn: data.productIds } },
      });
    }

    return tx.landingPage.findUniqueOrThrow({ where: { id }, include: WITH_RELATIONS });
  });
}

/** Soft-deletes a page scoped to (id, shopId). Returns false if no matching row exists for this shop (already deleted, wrong shop, or unknown id). */
export async function softDeleteLandingPage(shopId: string, id: string): Promise<boolean> {
  const result = await prisma.landingPage.updateMany({
    where: { id, shopId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}
