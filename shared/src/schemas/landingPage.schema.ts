import { z } from "zod";
import { ProductImageSchema } from "./product.schema.js";
import { PageDocumentSchema } from "./pageDocument.schema.js";

export const LandingPageStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type LandingPageStatus = z.infer<typeof LandingPageStatusSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SlugSchema = z.string().min(1).max(200).regex(SLUG_PATTERN, "Slug must be lowercase letters, numbers, and hyphens only");

export const LandingPageProductRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  featuredImage: ProductImageSchema.nullable(),
});
export type LandingPageProductRef = z.infer<typeof LandingPageProductRefSchema>;

export const LandingPageSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: LandingPageStatusSchema,
  productCount: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LandingPageSummary = z.infer<typeof LandingPageSummarySchema>;

export const LandingPageDetailSchema = LandingPageSummarySchema.extend({
  config: PageDocumentSchema,
  products: z.array(LandingPageProductRefSchema),
});
export type LandingPageDetail = z.infer<typeof LandingPageDetailSchema>;

export const LandingPageListResponseSchema = z.object({
  items: z.array(LandingPageSummarySchema),
  nextCursor: z.string().nullable(),
});
export type LandingPageListResponse = z.infer<typeof LandingPageListResponseSchema>;

export const LandingPageDetailResponseSchema = z.object({
  landingPage: LandingPageDetailSchema,
});
export type LandingPageDetailResponse = z.infer<typeof LandingPageDetailResponseSchema>;

// `config`, when provided by a client, must always be the current
// canonical PageDocument — the legacy Phase 3 shape is only ever produced
// by reading old stored rows through the server-side migration boundary
// (pageDocumentMigration.ts), never accepted as new input.
export const CreateLandingPageInputSchema = z.object({
  title: z.string().min(1).max(200),
  slug: SlugSchema.optional(),
  config: PageDocumentSchema.optional(),
  productIds: z.array(z.string().min(1)).max(100).optional(),
});
export type CreateLandingPageInput = z.infer<typeof CreateLandingPageInputSchema>;

export const UpdateLandingPageInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    slug: SlugSchema,
    status: LandingPageStatusSchema,
    config: PageDocumentSchema,
    productIds: z.array(z.string().min(1)).max(100),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided");
export type UpdateLandingPageInput = z.infer<typeof UpdateLandingPageInputSchema>;
