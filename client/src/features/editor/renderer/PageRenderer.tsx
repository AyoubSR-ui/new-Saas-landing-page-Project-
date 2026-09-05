import type { PageDocument, PageSection, ProductSummary } from "@ecommerce-landing-saas/shared";
import { SectionRenderer } from "./SectionRenderer";

export function paddingToCss(padding: PageSection["settings"]["padding"]): string {
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

/** The default section container: production styling only (padding/background from the section's own `settings`) — zero editor affordances. */
function defaultSectionContainer(section: PageSection, content: JSX.Element): JSX.Element {
  return <div style={{ padding: paddingToCss(section.settings.padding), backgroundColor: section.settings.backgroundColor }}>{content}</div>;
}

function EmptyPageState(): JSX.Element {
  return <p>This page has no sections yet.</p>;
}

export interface PageRendererProps {
  document: PageDocument;
  productsById: Record<string, ProductSummary>;
  /**
   * Optional per-section wrapper, injected by a caller that needs to add
   * editor-only affordances (selection outline, click-to-select) around a
   * canonically-rendered section — WITHOUT PageRenderer itself knowing
   * anything about editing. Standalone/production rendering omits this
   * entirely and gets plain production styling (see defaultSectionContainer).
   */
  renderSectionContainer?: (section: PageSection, content: JSX.Element) => JSX.Element;
}

/**
 * The one canonical page-rendering path: PageDocument -> sections[] ->
 * SectionRenderer -> typed section component. Deterministic — the same
 * document always produces the same rendered structure, in the same
 * order. Used identically by the editor's live preview and the standalone
 * preview surface; the editor is the only caller that supplies
 * `renderSectionContainer`.
 */
export function PageRenderer({ document, productsById, renderSectionContainer = defaultSectionContainer }: PageRendererProps): JSX.Element {
  if (document.sections.length === 0) {
    return <EmptyPageState />;
  }

  return (
    <div>
      {document.sections.map((section) => (
        <div key={section.id}>
          {renderSectionContainer(section, <SectionRenderer section={section} productsById={productsById} />)}
        </div>
      ))}
    </div>
  );
}
