import { z } from "zod";

// The canonical, versioned, Shopify-agnostic landing-page document. This is
// the SAME schema used by server-side validation, the client editor, the
// renderer, and (a future phase) AI generation — there is exactly one
// source of truth for "what a valid page document looks like."
export const PAGE_DOCUMENT_SCHEMA_VERSION = 2 as const;

// Ids double as React keys and DOM-adjacent identifiers, so the charset is
// restricted defensively rather than accepting an arbitrary string.
export const SectionIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Section id must contain only letters, numbers, - or _");

// Rejects the one URL scheme that can execute script when used as an href
// (`javascript:`), while still allowing relative paths, https/http, mailto,
// tel, and anchors. This is the renderer's and the API's only line of
// defense against script-injection-via-link, since section props are never
// passed through `dangerouslySetInnerHTML`.
const DANGEROUS_URL_SCHEME = /^\s*javascript:/i;
export const SafeUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => !DANGEROUS_URL_SCHEME.test(value), "URL scheme is not allowed");

export const AlignmentSchema = z.enum(["left", "center", "right"]);
export type Alignment = z.infer<typeof AlignmentSchema>;

// A small, deliberately restricted presentation layer separate from
// section-specific content (`props`). Background color is restricted to
// hex so it can never carry a `url(...)` or other CSS injection payload.
export const SectionSettingsSchema = z
  .object({
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/, "backgroundColor must be a hex color")
      .optional(),
    padding: z.enum(["none", "small", "medium", "large"]).default("medium"),
  })
  .passthrough();
export type SectionSettings = z.infer<typeof SectionSettingsSchema>;

export const DEFAULT_SECTION_SETTINGS: SectionSettings = { padding: "medium" };

export const SectionTypeSchema = z.enum(["hero", "text", "image", "product_showcase"]);
export type SectionType = z.infer<typeof SectionTypeSchema>;

// --- Section prop schemas -----------------------------------------------
// Each uses `.passthrough()` rather than `.strict()`: unknown extra keys
// (e.g. from a future minor addition, or preserved during migration) are
// kept rather than silently dropped, while the fields this phase actually
// understands are still fully typed and validated.

export const HeroPropsSchema = z
  .object({
    headline: z.string().min(1).max(200),
    subheadline: z.string().max(500).optional(),
    ctaText: z.string().max(50).optional(),
    ctaTarget: SafeUrlSchema.optional(),
    imageUrl: SafeUrlSchema.optional(),
    imageAlt: z.string().max(300).optional(),
    alignment: AlignmentSchema.default("center"),
  })
  .passthrough();
export type HeroProps = z.infer<typeof HeroPropsSchema>;

export const TextPropsSchema = z
  .object({
    heading: z.string().max(200).optional(),
    body: z.string().max(5000).default(""),
    alignment: AlignmentSchema.default("left"),
  })
  .passthrough();
export type TextProps = z.infer<typeof TextPropsSchema>;

export const ImagePropsSchema = z
  .object({
    url: SafeUrlSchema,
    altText: z.string().max(300).default(""),
    linkUrl: SafeUrlSchema.optional(),
    alignment: AlignmentSchema.default("center"),
  })
  .passthrough();
export type ImageProps = z.infer<typeof ImagePropsSchema>;

// `productIds` are app-owned Phase 2 Product ids (never Shopify GIDs
// directly) — the document stores references only; the renderer/API
// resolve them through the product data layer, never duplicating Shopify
// product data into the document itself.
export const ProductShowcasePropsSchema = z
  .object({
    heading: z.string().max(200).optional(),
    productIds: z.array(z.string().min(1).max(100)).max(50).default([]),
    displayStyle: z.enum(["grid", "list"]).default("grid"),
  })
  .passthrough();
export type ProductShowcaseProps = z.infer<typeof ProductShowcasePropsSchema>;

export const HeroSectionSchema = z.object({
  id: SectionIdSchema,
  type: z.literal("hero"),
  props: HeroPropsSchema,
  settings: SectionSettingsSchema.default(DEFAULT_SECTION_SETTINGS),
});

export const TextSectionSchema = z.object({
  id: SectionIdSchema,
  type: z.literal("text"),
  props: TextPropsSchema,
  settings: SectionSettingsSchema.default(DEFAULT_SECTION_SETTINGS),
});

export const ImageSectionSchema = z.object({
  id: SectionIdSchema,
  type: z.literal("image"),
  props: ImagePropsSchema,
  settings: SectionSettingsSchema.default(DEFAULT_SECTION_SETTINGS),
});

export const ProductShowcaseSectionSchema = z.object({
  id: SectionIdSchema,
  type: z.literal("product_showcase"),
  props: ProductShowcasePropsSchema,
  settings: SectionSettingsSchema.default(DEFAULT_SECTION_SETTINGS),
});

export const PageSectionSchema = z.discriminatedUnion("type", [
  HeroSectionSchema,
  TextSectionSchema,
  ImageSectionSchema,
  ProductShowcaseSectionSchema,
]);
export type PageSection = z.infer<typeof PageSectionSchema>;
export type HeroSection = z.infer<typeof HeroSectionSchema>;
export type TextSection = z.infer<typeof TextSectionSchema>;
export type ImageSection = z.infer<typeof ImageSectionSchema>;
export type ProductShowcaseSection = z.infer<typeof ProductShowcaseSectionSchema>;

export const PageMetadataSchema = z
  .object({
    // Populated only by the migration boundary (pageDocumentMigration.ts on
    // the server) when a stored document could not be fully converted —
    // never written directly by client input.
    migrationNotes: z.array(z.string()).default([]),
  })
  .passthrough();
export type PageMetadata = z.infer<typeof PageMetadataSchema>;

export const PageDocumentSchema = z.object({
  schemaVersion: z.literal(PAGE_DOCUMENT_SCHEMA_VERSION),
  sections: z.array(PageSectionSchema).max(50),
  metadata: PageMetadataSchema.default({ migrationNotes: [] }),
});
export type PageDocument = z.infer<typeof PageDocumentSchema>;

export const DEFAULT_PAGE_DOCUMENT: PageDocument = {
  schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
  sections: [],
  metadata: { migrationNotes: [] },
};

// The Phase 3 shape, kept only so the server-side migration boundary can
// recognize and convert documents stored before this phase. Never accepted
// as client input going forward (see CreateLandingPageInputSchema in
// landingPage.schema.ts, which validates against PageDocumentSchema only).
export const LegacyPageDocumentV1Schema = z.object({
  version: z.literal(1),
  sections: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      props: z.record(z.unknown()),
    }),
  ),
});
export type LegacyPageDocumentV1 = z.infer<typeof LegacyPageDocumentV1Schema>;
