import {
  DEFAULT_SECTION_SETTINGS,
  HeroPropsSchema,
  ImagePropsSchema,
  LegacyPageDocumentV1Schema,
  PAGE_DOCUMENT_SCHEMA_VERSION,
  PageDocumentSchema,
  ProductShowcasePropsSchema,
  SectionIdSchema,
  TextPropsSchema,
  type LegacyPageDocumentV1,
  type PageDocument,
  type PageSection,
} from "@ecommerce-landing-saas/shared";

// The single migration boundary for stored page documents: every document
// read from the database passes through migratePageDocument() before it is
// handed to the contracts/API layer, the renderer, or (later) AI
// generation. Nothing else in the codebase should special-case an old
// document shape. See docs/decisions/0005-phase-4-landing-page-editor-foundation.md.

export class PageDocumentMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageDocumentMigrationError";
  }
}

function detectVersion(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.schemaVersion === "number") return obj.schemaVersion;
  if (typeof obj.version === "number") return obj.version;
  return null;
}

let sectionIdFallbackCounter = 0;

/** Sanitizes a legacy section id to the current id charset rather than dropping the section over an id-formatting issue alone. */
function sanitizeSectionId(rawId: string): string {
  const sanitized = rawId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 100);
  if (SectionIdSchema.safeParse(sanitized).success) {
    return sanitized;
  }
  sectionIdFallbackCounter += 1;
  return `migrated-section-${sectionIdFallbackCounter}`;
}

/** Best-effort migration of one legacy (v1) section into a v2 section. Returns null (and records a note) if the type is unrecognized or the props can't be made valid even with defaults — never throws, so one bad section can't fail the whole migration. */
function migrateLegacySection(
  legacy: LegacyPageDocumentV1["sections"][number],
  notes: string[],
): PageSection | null {
  const id = sanitizeSectionId(legacy.id);
  const type = legacy.type.trim().toLowerCase().replace(/-/g, "_");

  switch (type) {
    case "hero": {
      const props = HeroPropsSchema.safeParse({ headline: "Untitled", ...legacy.props });
      if (!props.success) {
        notes.push(`Dropped hero section (original id=${legacy.id}): ${props.error.issues[0]?.message ?? "invalid props"}`);
        return null;
      }
      return { id, type: "hero", props: props.data, settings: DEFAULT_SECTION_SETTINGS };
    }
    case "text": {
      const props = TextPropsSchema.safeParse({ ...legacy.props });
      if (!props.success) {
        notes.push(`Dropped text section (original id=${legacy.id}): ${props.error.issues[0]?.message ?? "invalid props"}`);
        return null;
      }
      return { id, type: "text", props: props.data, settings: DEFAULT_SECTION_SETTINGS };
    }
    case "image": {
      const props = ImagePropsSchema.safeParse({ ...legacy.props });
      if (!props.success) {
        notes.push(`Dropped image section (original id=${legacy.id}): missing or invalid image url`);
        return null;
      }
      return { id, type: "image", props: props.data, settings: DEFAULT_SECTION_SETTINGS };
    }
    case "product_showcase": {
      const props = ProductShowcasePropsSchema.safeParse({ ...legacy.props });
      if (!props.success) {
        notes.push(`Dropped product_showcase section (original id=${legacy.id}): ${props.error.issues[0]?.message ?? "invalid props"}`);
        return null;
      }
      return { id, type: "product_showcase", props: props.data, settings: DEFAULT_SECTION_SETTINGS };
    }
    default:
      // Nothing is silently discarded: the section can't be automatically
      // converted into a renderable v2 section (there is no schema for an
      // arbitrary legacy type), but its existence and original type are
      // preserved in metadata rather than vanishing without a trace.
      notes.push(`Dropped unrecognized section type "${legacy.type}" (id=${legacy.id}) during migration from schema v1.`);
      return null;
  }
}

function migrateV1ToV2(legacy: LegacyPageDocumentV1): PageDocument {
  const migrationNotes: string[] = [];
  const sections = legacy.sections
    .map((section) => migrateLegacySection(section, migrationNotes))
    .filter((section): section is PageSection => section !== null);

  return PageDocumentSchema.parse({
    schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    sections,
    metadata: { migrationNotes },
  });
}

/**
 * Normalizes any stored (or otherwise untrusted) page document into the
 * current canonical PageDocument.
 *
 *   stored document -> detect schemaVersion -> migrate -> canonical document
 *
 * Throws PageDocumentMigrationError for a document whose version is
 * missing, unrecognized, or whose content doesn't validate even after
 * migration — callers must not persist or render the result of a failed
 * migration.
 */
export function migratePageDocument(raw: unknown): PageDocument {
  const version = detectVersion(raw);

  if (version === PAGE_DOCUMENT_SCHEMA_VERSION) {
    const parsed = PageDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new PageDocumentMigrationError(`Stored page document failed validation: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  }

  if (version === 1) {
    const parsed = LegacyPageDocumentV1Schema.safeParse(raw);
    if (!parsed.success) {
      throw new PageDocumentMigrationError(`Legacy (v1) page document failed validation: ${parsed.error.issues[0]?.message}`);
    }
    return migrateV1ToV2(parsed.data);
  }

  if (version === null) {
    throw new PageDocumentMigrationError("Page document is missing a recognizable schema version");
  }

  throw new PageDocumentMigrationError(`Unsupported page document schema version: ${version}`);
}
