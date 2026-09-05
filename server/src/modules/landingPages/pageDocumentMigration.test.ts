import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_DOCUMENT, PAGE_DOCUMENT_SCHEMA_VERSION } from "@ecommerce-landing-saas/shared";
import { migratePageDocument, PageDocumentMigrationError } from "./pageDocumentMigration.js";

describe("migratePageDocument", () => {
  it("passes a current (v2) document through unchanged", () => {
    const doc = {
      schemaVersion: 2,
      sections: [{ id: "h1", type: "hero", props: { headline: "Hi" } }],
      metadata: {},
    };
    const result = migratePageDocument(doc);
    expect(result.schemaVersion).toBe(PAGE_DOCUMENT_SCHEMA_VERSION);
    expect(result.sections).toHaveLength(1);
  });

  it("migrates an empty legacy (v1) document to the current default shape", () => {
    const result = migratePageDocument({ version: 1, sections: [] });
    expect(result).toEqual(DEFAULT_PAGE_DOCUMENT);
  });

  it("migrates a legacy hero section, filling in a default headline if missing", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [{ id: "hero-1", type: "hero", props: { subheadline: "Old subtitle" } }],
    });
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      id: "hero-1",
      type: "hero",
      props: { headline: "Untitled", subheadline: "Old subtitle" },
    });
  });

  it("migrates a legacy text section and preserves its body", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [{ id: "text-1", type: "text", props: { body: "Preserved content" } }],
    });
    expect(result.sections[0]).toMatchObject({ type: "text", props: { body: "Preserved content" } });
  });

  it("normalizes a legacy type written with different casing/hyphenation", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [{ id: "ps-1", type: "Product-Showcase", props: { productIds: ["p1"] } }],
    });
    expect(result.sections[0]).toMatchObject({ type: "product_showcase", props: { productIds: ["p1"] } });
  });

  it("sanitizes a legacy section id that doesn't match the current id charset", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [{ id: "hero 1!", type: "text", props: { body: "x" } }],
    });
    expect(result.sections[0]?.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("drops an unrecognized section type but records it in metadata rather than silently discarding it", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [
        { id: "carousel-1", type: "carousel", props: { slides: [] } },
        { id: "text-1", type: "text", props: { body: "kept" } },
      ],
    });
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("text");
    expect(result.metadata.migrationNotes).toHaveLength(1);
    expect(result.metadata.migrationNotes[0]).toContain("carousel");
    expect(result.metadata.migrationNotes[0]).toContain("carousel-1");
  });

  it("drops an image section with no url and records the reason", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [{ id: "img-1", type: "image", props: {} }],
    });
    expect(result.sections).toHaveLength(0);
    expect(result.metadata.migrationNotes[0]).toContain("img-1");
  });

  it("preserves meaningful data across migration for a mixed document", () => {
    const result = migratePageDocument({
      version: 1,
      sections: [
        { id: "hero-1", type: "hero", props: { headline: "Big Sale", ctaText: "Shop now" } },
        { id: "text-1", type: "text", props: { body: "Details" } },
        { id: "unknown-1", type: "weird_widget", props: {} },
      ],
    });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ props: { headline: "Big Sale", ctaText: "Shop now" } });
    expect(result.sections[1]).toMatchObject({ props: { body: "Details" } });
    expect(result.metadata.migrationNotes).toHaveLength(1);
  });

  it("throws for a document with no recognizable schema version", () => {
    expect(() => migratePageDocument({ sections: [] })).toThrow(PageDocumentMigrationError);
    expect(() => migratePageDocument(null)).toThrow(PageDocumentMigrationError);
    expect(() => migratePageDocument("not a document")).toThrow(PageDocumentMigrationError);
  });

  it("throws for an unsupported future schema version", () => {
    expect(() => migratePageDocument({ schemaVersion: 99, sections: [] })).toThrow(PageDocumentMigrationError);
  });

  it("throws for a v2-tagged document that fails validation", () => {
    expect(() => migratePageDocument({ schemaVersion: 2, sections: "not-an-array" })).toThrow(PageDocumentMigrationError);
  });

  it("throws for a v1-tagged document that fails legacy validation", () => {
    expect(() => migratePageDocument({ version: 1, sections: "not-an-array" })).toThrow(PageDocumentMigrationError);
  });
});
