import type { CreateLandingPageInput, UpdateLandingPageInput } from "@ecommerce-landing-saas/shared";
import { DEFAULT_LANDING_PAGE_CONFIG } from "@ecommerce-landing-saas/shared";
import { Prisma } from "../../../prisma/generated/index.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { findProductByIdForShop } from "../shopify/products/productRepository.js";
import {
  createLandingPage as createLandingPageRow,
  findLandingPageByIdForShop,
  findLandingPagesByShop,
  softDeleteLandingPage,
  updateLandingPage as updateLandingPageRow,
  type LandingPageListPage,
  type LandingPageWithProducts,
} from "./landingPageRepository.js";
import { slugify } from "./slug.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION;
}

/** Every product id must resolve through the shop-scoped Phase 2 repository — a product belonging to another shop (or that doesn't exist) is rejected the same way, without revealing which. */
async function assertProductsBelongToShop(shopId: string, productIds: string[]): Promise<void> {
  for (const productId of productIds) {
    const product = await findProductByIdForShop(shopId, productId);
    if (!product) {
      throw new ValidationError(`Product ${productId} is not a valid product for this shop`);
    }
  }
}

export async function createLandingPage(
  shopId: string,
  input: CreateLandingPageInput,
): Promise<LandingPageWithProducts> {
  const productIds = input.productIds ?? [];
  await assertProductsBelongToShop(shopId, productIds);

  const slug = input.slug ?? slugify(input.title);

  try {
    return await createLandingPageRow(shopId, {
      title: input.title,
      slug,
      config: (input.config ?? DEFAULT_LANDING_PAGE_CONFIG) as Prisma.InputJsonValue,
      productIds,
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      throw new ConflictError(`Slug "${slug}" is already in use for this shop`);
    }
    throw err;
  }
}

export function listLandingPages(shopId: string, options: { cursor?: string; limit: number }): Promise<LandingPageListPage> {
  return findLandingPagesByShop(shopId, options);
}

export async function getLandingPage(shopId: string, id: string): Promise<LandingPageWithProducts> {
  const page = await findLandingPageByIdForShop(shopId, id);
  if (!page) {
    throw new NotFoundError("Landing page not found");
  }
  return page;
}

export async function updateLandingPage(
  shopId: string,
  id: string,
  input: UpdateLandingPageInput,
): Promise<LandingPageWithProducts> {
  if (input.productIds !== undefined) {
    await assertProductsBelongToShop(shopId, input.productIds);
  }

  try {
    const updated = await updateLandingPageRow(shopId, id, {
      title: input.title,
      slug: input.slug,
      status: input.status,
      config: input.config as Prisma.InputJsonValue | undefined,
      productIds: input.productIds,
    });

    if (!updated) {
      throw new NotFoundError("Landing page not found");
    }

    return updated;
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      throw new ConflictError(`Slug "${input.slug}" is already in use for this shop`);
    }
    throw err;
  }
}

export async function deleteLandingPage(shopId: string, id: string): Promise<void> {
  const deleted = await softDeleteLandingPage(shopId, id);
  if (!deleted) {
    throw new NotFoundError("Landing page not found");
  }
}
