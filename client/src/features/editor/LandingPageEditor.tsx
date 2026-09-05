import type { PageSection } from "@ecommerce-landing-saas/shared";
import { PageRenderer, paddingToCss } from "./renderer/PageRenderer";
import { PropertiesPanel } from "./PropertiesPanel";
import { SectionList } from "./SectionList";
import { useLandingPageEditor } from "./useLandingPageEditor";

interface LandingPageEditorProps {
  pageId: string;
  onClose: () => void;
}

// Three-pane layout (sections | canvas | properties) that wraps rather than
// overflows horizontally on narrow viewports — see docs/decisions/0005 for
// the responsive approach (flex-wrap, no fixed pixel widths, no separate
// device-preview simulator in this phase).
export function LandingPageEditor({ pageId, onClose }: LandingPageEditorProps): JSX.Element {
  const editor = useLandingPageEditor(pageId);
  const { state } = editor;

  if (state.loading) {
    return <p>Loading editor…</p>;
  }

  if (state.loadError) {
    return <p role="alert">{state.loadError}</p>;
  }

  if (!state.document) {
    return <p role="alert">The page could not be loaded.</p>;
  }

  return (
    <div>
      <header style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" onClick={onClose}>
          ← Back
        </button>
        <strong>Editor</strong>
        <span>{editor.dirty ? "Unsaved changes" : "Saved"}</span>
        <button type="button" onClick={editor.undo} disabled={!editor.canUndo}>
          Undo
        </button>
        <button type="button" onClick={editor.redo} disabled={!editor.canRedo}>
          Redo
        </button>
        <button type="button" onClick={() => void editor.save()} disabled={editor.state.saving || !editor.dirty}>
          {editor.state.saving ? "Saving…" : "Save"}
        </button>
        {state.saveError && <span role="alert">{state.saveError}</span>}
      </header>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
          <SectionList
            sections={state.document.sections}
            selectedSectionId={state.selectedSectionId}
            onSelect={editor.selectSection}
            onAdd={editor.addSection}
            onRemove={editor.removeSection}
            onMove={editor.moveSection}
          />
        </div>

        <div style={{ flex: "2 1 320px", minWidth: "260px", border: "1px solid #ddd", overflowX: "auto" }}>
          {/* Selection/click affordances are an editor-only wrapper around
              the canonical rendered section — PageRenderer itself has no
              concept of "selected" or "clickable". Same component the
              standalone preview uses, with zero editor coupling there. */}
          <PageRenderer
            document={state.document}
            productsById={editor.productsById}
            renderSectionContainer={(section: PageSection, content) => (
              <div
                onClick={() => editor.selectSection(section.id)}
                style={{
                  padding: paddingToCss(section.settings.padding),
                  backgroundColor: section.settings.backgroundColor,
                  outline: section.id === state.selectedSectionId ? "2px solid #2563eb" : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                {content}
              </div>
            )}
          />
        </div>

        <div style={{ flex: "1 1 220px", minWidth: "200px" }}>
          <PropertiesPanel
            section={editor.selectedSection}
            products={editor.products}
            onUpdateProps={editor.updateSectionProps}
            onUpdateSettings={editor.updateSectionSettings}
          />
        </div>
      </div>
    </div>
  );
}
