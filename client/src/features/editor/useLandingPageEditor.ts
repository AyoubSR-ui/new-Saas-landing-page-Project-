import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { PageSection, ProductSummary, SectionType } from "@ecommerce-landing-saas/shared";
import { fetchLandingPage, LandingPagesApiError, saveLandingPageDocument } from "../../lib/landingPagesApi";
import { fetchProducts } from "../../lib/productsApi";
import { createDefaultSection, editorReducer, initialEditorState, isDirty } from "./editorReducer";

export function useLandingPageEditor(pageId: string) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [products, setProducts] = useState<ProductSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [pageRes, productsRes] = await Promise.all([fetchLandingPage(pageId), fetchProducts()]);
        if (cancelled) return;
        dispatch({ type: "LOAD_SUCCESS", document: pageRes.landingPage.config });
        setProducts(productsRes.items);
      } catch (err) {
        if (cancelled) return;
        dispatch({ type: "LOAD_ERROR", message: err instanceof LandingPagesApiError ? err.message : "Could not load the page." });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const selectedSection: PageSection | null =
    state.document?.sections.find((s) => s.id === state.selectedSectionId) ?? null;

  const addSection = useCallback((type: SectionType) => {
    dispatch({ type: "ADD_SECTION", section: createDefaultSection(type) });
  }, []);

  const removeSection = useCallback((id: string) => dispatch({ type: "REMOVE_SECTION", id }), []);
  const moveSection = useCallback(
    (id: string, direction: "up" | "down") => dispatch({ type: "MOVE_SECTION", id, direction }),
    [],
  );
  const selectSection = useCallback((id: string | null) => dispatch({ type: "SELECT_SECTION", id }), []);
  const updateSectionProps = useCallback(
    (id: string, props: Record<string, unknown>) => dispatch({ type: "UPDATE_SECTION_PROPS", id, props }),
    [],
  );
  const updateSectionSettings = useCallback(
    (id: string, settings: Record<string, unknown>) => dispatch({ type: "UPDATE_SECTION_SETTINGS", id, settings }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  const save = useCallback(async () => {
    if (!state.document) return;
    dispatch({ type: "SAVE_START" });
    try {
      const res = await saveLandingPageDocument(pageId, state.document);
      dispatch({ type: "SAVE_SUCCESS", document: res.landingPage.config });
    } catch (err) {
      dispatch({ type: "SAVE_ERROR", message: err instanceof LandingPagesApiError ? err.message : "Could not save the page." });
    }
  }, [pageId, state.document]);

  return {
    state,
    dirty: isDirty(state),
    products,
    productsById,
    selectedSection,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    addSection,
    removeSection,
    moveSection,
    selectSection,
    updateSectionProps,
    updateSectionSettings,
    undo,
    redo,
    save,
  };
}
