import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_DOCUMENT,
  HeroSectionSchema,
  ImageSectionSchema,
  PageDocumentSchema,
  PageSectionSchema,
  ProductShowcaseSectionSchema,
  SafeUrlSchema,
  TextSectionSchema,
} from "./pageDocument.schema.js";

describe("PageDocumentSchema", () => {
  it("accepts the default empty document", () => {
    expect(PageDocumentSchema.parse(DEFAULT_PAGE_DOCUMENT)).toEqual(DEFAULT_PAGE_DOCUMENT);
  });

  it("accepts a document containing one of each supported section type", () => {
    const doc = {
      schemaVersion: 2,
      sections: [
        { id: "hero-1", type: "hero", props: { headline: "Welcome" } },
        { id: "text-1", type: "text", props: { body: "Hello" } },
        { id: "image-1", type: "image", props: { url: "https://cdn.example/a.jpg" } },
        { id: "products-1", type: "product_showcase", props: { productIds: ["p1", "p2"] } },
      ],
      metadata: {},
    };
    const parsed = PageDocumentSchema.parse(doc);
    expect(parsed.sections).toHaveLength(4);
    expect(parsed.sections[0]).toMatchObject({ type: "hero", props: { headline: "Welcome", alignment: "center" } });
    expect(parsed.sections[3]).toMatchObject({ type: "product_showcase", props: { productIds: ["p1", "p2"] } });
  });

  it("rejects an unknown section type", () => {
    expect(() =>
      PageDocumentSchema.parse({
        schemaVersion: 2,
        sections: [{ id: "s1", type: "carousel", props: {} }],
        metadata: {},
      }),
    ).toThrow();
  });

  it("rejects a malformed section id", () => {
    expect(() =>
      PageSectionSchema.parse({ id: "not a valid id!", type: "text", props: { body: "x" } }),
    ).toThrow();
  });

  it("rejects invalid props for a known section type", () => {
    // hero requires a non-empty headline
    expect(() => HeroSectionSchema.parse({ id: "h1", type: "hero", props: {} })).toThrow();
  });

  it("rejects an unsupported schema version", () => {
    expect(() => PageDocumentSchema.parse({ schemaVersion: 1, sections: [], metadata: {} })).toThrow();
    expect(() => PageDocumentSchema.parse({ schemaVersion: 99, sections: [], metadata: {} })).toThrow();
  });

  it("rejects a malformed document (sections not an array)", () => {
    expect(() => PageDocumentSchema.parse({ schemaVersion: 2, sections: "not-an-array", metadata: {} })).toThrow();
  });

  it("rejects completely invalid input", () => {
    expect(() => PageDocumentSchema.parse(null)).toThrow();
    expect(() => PageDocumentSchema.parse("a string")).toThrow();
    expect(() => PageDocumentSchema.parse(42)).toThrow();
  });

  it("preserves unknown extra keys in props via passthrough, rather than silently dropping them", () => {
    const parsed = HeroSectionSchema.parse({
      id: "h1",
      type: "hero",
      props: { headline: "Hi", futureField: "kept" },
    });
    expect((parsed.props as Record<string, unknown>).futureField).toBe("kept");
  });
});

describe("TextSectionSchema", () => {
  it("defaults body to an empty string and alignment to left", () => {
    const parsed = TextSectionSchema.parse({ id: "t1", type: "text", props: {} });
    expect(parsed.props.body).toBe("");
    expect(parsed.props.alignment).toBe("left");
  });
});

describe("ImageSectionSchema", () => {
  it("requires a url", () => {
    expect(() => ImageSectionSchema.parse({ id: "i1", type: "image", props: {} })).toThrow();
  });

  it("accepts a valid https url", () => {
    const parsed = ImageSectionSchema.parse({ id: "i1", type: "image", props: { url: "https://cdn.example/a.jpg" } });
    expect(parsed.props.url).toBe("https://cdn.example/a.jpg");
  });
});

describe("ProductShowcaseSectionSchema", () => {
  it("defaults productIds to an empty array", () => {
    const parsed = ProductShowcaseSectionSchema.parse({ id: "p1", type: "product_showcase", props: {} });
    expect(parsed.props.productIds).toEqual([]);
  });

  it("rejects more than 50 product ids", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `p${i}`);
    expect(() =>
      ProductShowcaseSectionSchema.parse({ id: "p1", type: "product_showcase", props: { productIds: tooMany } }),
    ).toThrow();
  });
});

describe("SafeUrlSchema", () => {
  it("accepts https, relative, mailto, and anchor URLs", () => {
    expect(SafeUrlSchema.parse("https://example.com")).toBe("https://example.com");
    expect(SafeUrlSchema.parse("/products/foo")).toBe("/products/foo");
    expect(SafeUrlSchema.parse("mailto:hi@example.com")).toBe("mailto:hi@example.com");
    expect(SafeUrlSchema.parse("#section")).toBe("#section");
  });

  it("rejects a javascript: URL, case-insensitively and with leading whitespace", () => {
    expect(() => SafeUrlSchema.parse("javascript:alert(1)")).toThrow();
    expect(() => SafeUrlSchema.parse("  JavaScript:alert(1)")).toThrow();
  });
});
