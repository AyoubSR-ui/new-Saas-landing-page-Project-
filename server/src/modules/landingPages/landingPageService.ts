import type { CreateLandingPageInput, PageDocument, UpdateLandingPageInput } from "@ecommerce-landing-saas/shared";
import { DEFAULT_PAGE_DOCUMENT } from "@ecommerce-landing-saas/shared";
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
import { migratePageDocument, PageDocumentMigrationError } from "./pageDocumentMigration.js";
import { slugify } from "./slug.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION;
}

// Every row read from the repository carries `config` as raw, untyped JSON
// (Prisma has no notion of our Zod schema) — this is the type once the
// service layer has run it through the migration boundary and guaranteed
// it is a valid current-schema PageDocument. contracts.ts and everything
// downstream should only ever see this type, never the raw repository one.
export type LandingPageWithDocument = Omit<LandingPageWithProducts, "config"> & { config: PageDocument };

function normalize(page: LandingPageWithProducts): LandingPageWithDocument {
  let document: PageDocument;
  try {
    document = migratePageDocument(page.config);
  } catch (err) {
    if (err instanceof PageDocumentMigrationError) {
      // A document that can't be normalized is a data-integrity problem,
      // not something to surface as a 4xx to the caller of this request —
      // but it also must never crash the process or leak schema internals.
      throw new Error(`Landing page ${page.id} has an unreadable page document: ${err.message}`);
    }
    throw err;
  }
  return { ...page, config: document };
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

/** Collects every product id referenced by a product_showcase section in the document — these are a second, independent product-reference surface from the page-level `productIds`/LandingPageProduct association, and must be tenant-validated the same way before the document is ever persisted. */
function extractDocumentProductIds(document: PageDocument): string[] {
  const ids = new Set<string>();
  for (const section of document.sections) {
    if (section.type === "product_showcase") {
      for (const id of section.props.productIds) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

async function assertDocumentProductReferencesAreValid(shopId: string, document: PageDocument): Promise<void> {
  await assertProductsBelongToShop(shopId, extractDocumentProductIds(document));
}

export async function createLandingPage(
  shopId: string,
  input: CreateLandingPageInput,
): Promise<LandingPageWithDocument> {
  const productIds = input.productIds ?? [];
  await assertProductsBelongToShop(shopId, productIds);

  const document = input.config ?? DEFAULT_PAGE_DOCUMENT;
  await assertDocumentProductReferencesAreValid(shopId, document);

  const slug = input.slug ?? slugify(input.title);

  try {
    const created = await createLandingPageRow(shopId, {
      title: input.title,
      slug,
      config: document as Prisma.InputJsonValue,
      productIds,
    });
    return normalize(created);
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      throw new ConflictError(`Slug "${slug}" is already in use for this shop`);
    }
    throw err;
  }
}

export async function listLandingPages(
  shopId: string,
  options: { cursor?: string; limit: number },
): Promise<{ items: LandingPageWithDocument[]; nextCursor: string | null }> {
  const page: LandingPageListPage = await findLandingPagesByShop(shopId, options);
  return { items: page.items.map(normalize), nextCursor: page.nextCursor };
}

export async function getLandingPage(shopId: string, id: string): Promise<LandingPageWithDocument> {
  const page = await findLandingPageByIdForShop(shopId, id);
  if (!page) {
    throw new NotFoundError("Landing page not found");
  }
  return normalize(page);
}

export async function updateLandingPage(
  shopId: string,
  id: string,
  input: UpdateLandingPageInput,
): Promise<LandingPageWithDocument> {
  if (input.productIds !== undefined) {
    await assertProductsBelongToShop(shopId, input.productIds);
  }
  if (input.config !== undefined) {
    await assertDocumentProductReferencesAreValid(shopId, input.config);
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

    return normalize(updated);
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
