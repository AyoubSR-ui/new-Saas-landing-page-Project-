import { z } from "zod";
import { ProductImageSchema } from "./product.schema.js";

export const LandingPageStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type LandingPageStatus = z.infer<typeof LandingPageStatusSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SlugSchema = z.string().min(1).max(200).regex(SLUG_PATTERN, "Slug must be lowercase letters, numbers, and hyphens only");

// A landing page's persisted structure — deliberately generic and
// Shopify-agnostic (opaque `props` bag per section) so a future visual
// editor/AI-generation phase can evolve section shapes without a schema
// migration. `version` exists so a future phase can migrate old configs.
export const LandingPageSectionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.unknown()),
});
export type LandingPageSection = z.infer<typeof LandingPageSectionSchema>;

export const LandingPageConfigSchema = z.object({
  version: z.literal(1),
  sections: z.array(LandingPageSectionSchema),
});
export type LandingPageConfig = z.infer<typeof LandingPageConfigSchema>;

export const DEFAULT_LANDING_PAGE_CONFIG: LandingPageConfig = { version: 1, sections: [] };

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
  config: LandingPageConfigSchema,
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

export const CreateLandingPageInputSchema = z.object({
  title: z.string().min(1).max(200),
  slug: SlugSchema.optional(),
  config: LandingPageConfigSchema.optional(),
  productIds: z.array(z.string().min(1)).max(100).optional(),
});
export type CreateLandingPageInput = z.infer<typeof CreateLandingPageInputSchema>;

export const UpdateLandingPageInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    slug: SlugSchema,
    status: LandingPageStatusSchema,
    config: LandingPageConfigSchema,
    productIds: z.array(z.string().min(1)).max(100),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided");
export type UpdateLandingPageInput = z.infer<typeof UpdateLandingPageInputSchema>;
