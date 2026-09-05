import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PageDocument } from "@ecommerce-landing-saas/shared";
import { editorReducer, initialEditorState, type EditorState } from "./editorReducer";
import { PageRenderer } from "./renderer/PageRenderer";

afterEach(() => cleanup());

// These tests exercise the real reducer feeding the real PageRenderer —
// exactly the data flow LandingPageEditor uses for its live preview —
// without needing to mock the network fetches its hook performs.
function renderDocument(document: PageDocument) {
  return render(<PageRenderer document={document} productsById={{}} />);
}

function loaded(document: PageDocument): EditorState {
  return editorReducer(initialEditorState, { type: "LOAD_SUCCESS", document });
}

const EMPTY_DOC: PageDocument = { schemaVersion: 2, sections: [], metadata: { migrationNotes: [] } };

describe("editor live preview (reducer -> PageRenderer)", () => {
  it("reflects the current document immediately after load", () => {
    const state = loaded(EMPTY_DOC);
    renderDocument(state.document!);
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument();
  });

  it("adding a section updates the preview", () => {
    let state = loaded(EMPTY_DOC);
    state = editorReducer(state, {
      type: "ADD_SECTION",
      section: { id: "h1", type: "hero", props: { headline: "New Hero", alignment: "center" }, settings: { padding: "medium" } },
    });

    renderDocument(state.document!);
    expect(screen.getByText("New Hero")).toBeInTheDocument();
  });

  it("removing a section updates the preview", () => {
    let state = loaded({
      schemaVersion: 2,
      sections: [{ id: "h1", type: "hero", props: { headline: "Gone Soon", alignment: "center" }, settings: { padding: "medium" } }],
      metadata: { migrationNotes: [] },
    });
    state = editorReducer(state, { type: "REMOVE_SECTION", id: "h1" });

    renderDocument(state.document!);
    expect(screen.queryByText("Gone Soon")).toBeNull();
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument();
  });

  it("reordering sections changes the rendered order", () => {
    let state = loaded({
      schemaVersion: 2,
      sections: [
        { id: "a", type: "text", props: { body: "First", alignment: "left" }, settings: { padding: "medium" } },
        { id: "b", type: "text", props: { body: "Second", alignment: "left" }, settings: { padding: "medium" } },
      ],
      metadata: { migrationNotes: [] },
    });
    state = editorReducer(state, { type: "MOVE_SECTION", id: "b", direction: "up" });

    expect(state.document!.sections.map((s) => s.id)).toEqual(["b", "a"]);

    const { container } = renderDocument(state.document!);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs[0]).toHaveTextContent("Second");
    expect(paragraphs[1]).toHaveTextContent("First");
  });

  it("editing section properties changes the rendered result", () => {
    let state = loaded({
      schemaVersion: 2,
      sections: [{ id: "h1", type: "hero", props: { headline: "Old headline", alignment: "center" }, settings: { padding: "medium" } }],
      metadata: { migrationNotes: [] },
    });
    state = editorReducer(state, { type: "UPDATE_SECTION_PROPS", id: "h1", props: { headline: "New headline" } });

    renderDocument(state.document!);
    expect(screen.queryByText("Old headline")).toBeNull();
    expect(screen.getByText("New headline")).toBeInTheDocument();
  });
});
