import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PageDocument, PageSection, ProductSummary } from "@ecommerce-landing-saas/shared";
import { PageRenderer } from "./PageRenderer";

afterEach(() => cleanup());

function doc(sections: PageSection[]): PageDocument {
  return { schemaVersion: 2, sections, metadata: { migrationNotes: [] } };
}

function heroSection(id: string, headline: string): PageSection {
  return { id, type: "hero", props: { headline, alignment: "center" }, settings: { padding: "medium" } };
}

function textSection(id: string, body: string): PageSection {
  return { id, type: "text", props: { body, alignment: "left" }, settings: { padding: "medium" } };
}

describe("PageRenderer", () => {
  it("renders sections in document order", () => {
    render(
      <PageRenderer
        document={doc([heroSection("h1", "First"), textSection("t1", "Second content")])}
        productsById={{}}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings[0]).toHaveTextContent("First");
    expect(screen.getByText("Second content")).toBeInTheDocument();
  });

  it("dispatches the correct component for each supported section type", () => {
    const products: Record<string, ProductSummary> = {
      p1: {
        id: "p1",
        title: "Mug",
        handle: "mug",
        status: "ACTIVE",
        vendor: null,
        productType: null,
        featuredImage: null,
        priceRange: null,
        variantCount: 0,
        updatedAt: new Date().toISOString(),
        lastSyncedAt: null,
      },
    };

    render(
      <PageRenderer
        document={doc([
          heroSection("h1", "Hero headline"),
          textSection("t1", "Text body"),
          { id: "i1", type: "image", props: { url: "https://cdn.example/a.jpg", altText: "An image", alignment: "center" }, settings: { padding: "medium" } },
          { id: "p1", type: "product_showcase", props: { productIds: ["p1"], displayStyle: "grid" }, settings: { padding: "medium" } },
        ])}
        productsById={products}
      />,
    );

    expect(screen.getByText("Hero headline")).toBeInTheDocument();
    expect(screen.getByText("Text body")).toBeInTheDocument();
    expect(screen.getByAltText("An image")).toBeInTheDocument();
    expect(screen.getByText("Mug")).toBeInTheDocument();
  });

  it("renders a useful empty state for a document with zero sections, without crashing", () => {
    render(<PageRenderer document={doc([])} productsById={{}} />);
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument();
  });

  it("renders a safe fallback for an unsupported section type instead of crashing", () => {
    const weirdSection = { id: "w1", type: "carousel", props: {}, settings: { padding: "medium" } } as unknown as PageSection;
    render(<PageRenderer document={doc([weirdSection])} productsById={{}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported section type/i);
  });

  it("applies a custom renderSectionContainer (editor use) without altering the default (standalone) path", () => {
    const document = doc([heroSection("h1", "Hi")]);

    const { container: withWrapper } = render(
      <PageRenderer
        document={document}
        productsById={{}}
        renderSectionContainer={(section, content) => <div data-testid={`wrapped-${section.id}`}>{content}</div>}
      />,
    );
    expect(withWrapper.querySelector('[data-testid="wrapped-h1"]')).not.toBeNull();
    cleanup();

    const { container: standalone } = render(<PageRenderer document={document} productsById={{}} />);
    expect(standalone.querySelector('[data-testid^="wrapped-"]')).toBeNull();
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });
});
