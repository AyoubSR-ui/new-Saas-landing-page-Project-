import type { PageDocument, PageSection, SectionType } from "@ecommerce-landing-saas/shared";
import { DEFAULT_SECTION_SETTINGS } from "@ecommerce-landing-saas/shared";

// Single, explicit editor-state model (per Phase 4's architecture
// requirement) rather than scattered component-local state. `document` is
// null only before the initial load resolves. `past`/`future` are an
// in-memory-only undo/redo history — never persisted, never sent to the
// server (see docs/decisions/0005-phase-4-landing-page-editor-foundation.md).
export interface EditorState {
  document: PageDocument | null;
  savedDocument: PageDocument | null;
  selectedSectionId: string | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  validationErrors: string[];
  past: PageDocument[];
  future: PageDocument[];
}

export const initialEditorState: EditorState = {
  document: null,
  savedDocument: null,
  selectedSectionId: null,
  loading: true,
  loadError: null,
  saving: false,
  saveError: null,
  validationErrors: [],
  past: [],
  future: [],
};

export type EditorAction =
  | { type: "LOAD_SUCCESS"; document: PageDocument }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "ADD_SECTION"; section: PageSection }
  | { type: "REMOVE_SECTION"; id: string }
  | { type: "MOVE_SECTION"; id: string; direction: "up" | "down" }
  | { type: "SELECT_SECTION"; id: string | null }
  | { type: "UPDATE_SECTION_PROPS"; id: string; props: Record<string, unknown> }
  | { type: "UPDATE_SECTION_SETTINGS"; id: string; settings: Record<string, unknown> }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; document: PageDocument }
  | { type: "SAVE_ERROR"; message: string };

let idCounter = 0;
/** Section ids must be stable and unique — never an array index. Uses crypto.randomUUID() where available, with a monotonic fallback. */
export function createSectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `section-${Date.now()}-${idCounter}`;
}

export function createDefaultSection(type: SectionType): PageSection {
  const id = createSectionId();
  const settings = { ...DEFAULT_SECTION_SETTINGS };
  switch (type) {
    case "hero":
      return { id, type, props: { headline: "New headline", alignment: "center" }, settings };
    case "text":
      return { id, type, props: { body: "", alignment: "left" }, settings };
    case "image":
      return { id, type, props: { url: "", altText: "", alignment: "center" }, settings };
    case "product_showcase":
      return { id, type, props: { productIds: [], displayStyle: "grid" }, settings };
  }
}

function withDocumentChange(state: EditorState, nextDocument: PageDocument): EditorState {
  if (!state.document) {
    return state;
  }
  return {
    ...state,
    document: nextDocument,
    past: [...state.past, state.document],
    future: [],
  };
}

function mapSection(document: PageDocument, id: string, fn: (section: PageSection) => PageSection): PageDocument {
  return { ...document, sections: document.sections.map((section) => (section.id === id ? fn(section) : section)) };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "LOAD_SUCCESS":
      return { ...state, document: action.document, savedDocument: action.document, loading: false, loadError: null };

    case "LOAD_ERROR":
      return { ...state, loading: false, loadError: action.message };

    case "ADD_SECTION": {
      if (!state.document) return state;
      const next = { ...state.document, sections: [...state.document.sections, action.section] };
      return { ...withDocumentChange(state, next), selectedSectionId: action.section.id };
    }

    case "REMOVE_SECTION": {
      if (!state.document) return state;
      const next = { ...state.document, sections: state.document.sections.filter((s) => s.id !== action.id) };
      return {
        ...withDocumentChange(state, next),
        selectedSectionId: state.selectedSectionId === action.id ? null : state.selectedSectionId,
      };
    }

    case "MOVE_SECTION": {
      if (!state.document) return state;
      const sections = [...state.document.sections];
      const index = sections.findIndex((s) => s.id === action.id);
      if (index === -1) return state;
      const targetIndex = action.direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sections.length) return state;
      [sections[index], sections[targetIndex]] = [sections[targetIndex] as PageSection, sections[index] as PageSection];
      return withDocumentChange(state, { ...state.document, sections });
    }

    case "SELECT_SECTION":
      return { ...state, selectedSectionId: action.id };

    case "UPDATE_SECTION_PROPS": {
      if (!state.document) return state;
      const next = mapSection(
        state.document,
        action.id,
        (section) => ({ ...section, props: { ...section.props, ...action.props } }) as PageSection,
      );
      return withDocumentChange(state, next);
    }

    case "UPDATE_SECTION_SETTINGS": {
      if (!state.document) return state;
      const next = mapSection(state.document, action.id, (section) => ({
        ...section,
        settings: { ...section.settings, ...action.settings },
      }));
      return withDocumentChange(state, next);
    }

    case "UNDO": {
      const previous = state.past[state.past.length - 1];
      if (!previous || !state.document) return state;
      return {
        ...state,
        document: previous,
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future],
      };
    }

    case "REDO": {
      const next = state.future[0];
      if (!next || !state.document) return state;
      return {
        ...state,
        document: next,
        past: [...state.past, state.document],
        future: state.future.slice(1),
      };
    }

    case "SAVE_START":
      return { ...state, saving: true, saveError: null };

    case "SAVE_SUCCESS":
      return { ...state, saving: false, saveError: null, document: action.document, savedDocument: action.document };

    case "SAVE_ERROR":
      return { ...state, saving: false, saveError: action.message };

    default:
      return state;
  }
}

export function isDirty(state: EditorState): boolean {
  if (!state.document || !state.savedDocument) return false;
  return JSON.stringify(state.document) !== JSON.stringify(state.savedDocument);
}
