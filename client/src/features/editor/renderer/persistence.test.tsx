import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageDocumentSchema } from "@ecommerce-landing-saas/shared";
import { PageRenderer } from "./PageRenderer";

afterEach(() => cleanup());

// This is the client-side half of "a page document saved by Phase 4 loads
// correctly and renders the same way after a reload": it validates a
// document through the exact same shared PageDocumentSchema the server
// applies at its API boundary (server/src/modules/landingPages/routes.ts and
// pageDocumentMigration.ts), simulating exactly what fetchLandingPage()
// hands the renderer after a save/reload round trip. The server-side half
// (real persistence through Prisma, and legacy-document migration) is
// covered by server/src/modules/landingPages/landingPageRepository.integration.test.ts
// and pageDocumentMigration.test.ts.
const PERSISTED_DOCUMENT_JSON = JSON.stringify({
  schemaVersion: 2,
  sections: [
    { id: "hero-1", type: "hero", props: { headline: "Big Sale", ctaText: "Shop now", ctaTarget: "/products" }, settings: { padding: "large" } },
    { id: "text-1", type: "text", props: { body: "Limited time only." }, settings: { padding: "medium" } },
  ],
  metadata: { migrationNotes: [] },
});

describe("persisted document compatibility", () => {
  it("a document round-tripped through JSON (as it would be over the API) still validates and renders", () => {
    const parsed = PageDocumentSchema.parse(JSON.parse(PERSISTED_DOCUMENT_JSON));

    render(<PageRenderer document={parsed} productsById={{}} />);

    expect(screen.getByText("Big Sale")).toBeInTheDocument();
    expect(screen.getByText("Shop now")).toBeInTheDocument();
    expect(screen.getByText("Limited time only.")).toBeInTheDocument();
  });

  it("re-parsing and re-rendering an already-valid document produces the same output ('reload' is idempotent)", () => {
    const first = PageDocumentSchema.parse(JSON.parse(PERSISTED_DOCUMENT_JSON));
    const { container: firstRender } = render(<PageRenderer document={first} productsById={{}} />);
    const firstHtml = firstRender.innerHTML;
    cleanup();

    // Simulate reload: parse again from the same persisted JSON.
    const second = PageDocumentSchema.parse(JSON.parse(PERSISTED_DOCUMENT_JSON));
    const { container: secondRender } = render(<PageRenderer document={second} productsById={{}} />);

    expect(secondRender.innerHTML).toBe(firstHtml);
  });

  it("rejects a document that fails the shared schema (a corrupted/invalid persisted row) rather than rendering garbage", () => {
    expect(() => PageDocumentSchema.parse({ schemaVersion: 2, sections: [{ id: "x", type: "not-a-real-type", props: {} }] })).toThrow();
  });
});
