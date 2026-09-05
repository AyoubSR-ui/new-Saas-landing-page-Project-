import type { PageDocument, PageSection, ProductSummary } from "@ecommerce-landing-saas/shared";
import { HeroSection, ImageSection, ProductShowcaseSection, TextSection } from "./sections";

interface SectionRendererProps {
  section: PageSection;
  productsById: Record<string, ProductSummary>;
}

// Dispatch by section type through a static lookup table — never by
// evaluating a type string as a component name or executing anything from
// the document itself. An entry not present here (a future/unknown type)
// falls through to UnknownSection rather than throwing.
const SECTION_RENDERERS: Record<PageSection["type"], (props: SectionRendererProps) => JSX.Element> = {
  hero: ({ section }) => <HeroSection section={section as Extract<PageSection, { type: "hero" }>} />,
  text: ({ section }) => <TextSection section={section as Extract<PageSection, { type: "text" }>} />,
  image: ({ section }) => <ImageSection section={section as Extract<PageSection, { type: "image" }>} />,
  product_showcase: ({ section, productsById }) => (
    <ProductShowcaseSection section={section as Extract<PageSection, { type: "product_showcase" }>} productsById={productsById} />
  ),
};

function UnknownSection({ type }: { type: string }): JSX.Element {
  return <div role="alert">Unsupported section type: {type}</div>;
}

function paddingToCss(padding: PageSection["settings"]["padding"]): string {
  switch (padding) {
    case "none":
      return "0";
    case "small":
      return "0.5rem";
    case "large":
      return "3rem";
    default:
      return "1.5rem";
  }
}

export interface PageRendererProps {
  document: PageDocument;
  productsById: Record<string, ProductSummary>;
  selectedSectionId?: string | null;
  onSelectSection?: (id: string) => void;
}

/**
 * Deterministic: the same document always produces the same rendered
 * structure — section order maps 1:1 to render order, and dispatch is a
 * pure lookup on `section.type`, never dynamic code execution.
 */
export function PageRenderer({ document, productsById, selectedSectionId, onSelectSection }: PageRendererProps): JSX.Element {
  return (
    <div>
      {document.sections.map((section) => {
        const renderSection = SECTION_RENDERERS[section.type];
        return (
          <div
            key={section.id}
            onClick={onSelectSection ? () => onSelectSection(section.id) : undefined}
            style={{
              padding: paddingToCss(section.settings.padding),
              backgroundColor: section.settings.backgroundColor,
              outline: section.id === selectedSectionId ? "2px solid #2563eb" : "1px solid transparent",
              cursor: onSelectSection ? "pointer" : undefined,
            }}
          >
            {renderSection ? renderSection({ section, productsById }) : <UnknownSection type={section.type} />}
          </div>
        );
      })}
    </div>
  );
}
