import type { PageSection, ProductSummary } from "@ecommerce-landing-saas/shared";
import { HeroSection, ImageSection, ProductShowcaseSection, TextSection } from "./sections";

interface SectionDispatchProps {
  section: PageSection;
  productsById: Record<string, ProductSummary>;
}

// The one canonical per-section rendering path — dispatch by section type
// through a static lookup table, never by evaluating a type string as a
// component name or executing anything from the document itself. Reused
// identically by PageRenderer (editor preview, standalone preview, and any
// future published-page rendering) — there is no second implementation.
const SECTION_RENDERERS: Record<PageSection["type"], (props: SectionDispatchProps) => JSX.Element> = {
  hero: ({ section }) => <HeroSection section={section as Extract<PageSection, { type: "hero" }>} />,
  text: ({ section }) => <TextSection section={section as Extract<PageSection, { type: "text" }>} />,
  image: ({ section }) => <ImageSection section={section as Extract<PageSection, { type: "image" }>} />,
  product_showcase: ({ section, productsById }) => (
    <ProductShowcaseSection section={section as Extract<PageSection, { type: "product_showcase" }>} productsById={productsById} />
  ),
};

function UnknownSection({ type }: { type: string }): JSX.Element {
  if (import.meta.env.DEV) {
    console.warn(`[SectionRenderer] Unsupported section type encountered: "${type}"`);
  }
  return <div role="alert">Unsupported section type: {type}</div>;
}

/**
 * Renders exactly one section, dispatched by its typed `type`. An entry not
 * present in the lookup (a future/unknown type, or a client bundle older
 * than the schema version that produced the document) falls through to a
 * safe, visible fallback instead of throwing.
 */
export function SectionRenderer({ section, productsById }: SectionDispatchProps): JSX.Element {
  const render = SECTION_RENDERERS[section.type];
  return render ? render({ section, productsById }) : <UnknownSection type={section.type} />;
}
