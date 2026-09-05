import { useEffect, useMemo, useState } from "react";
import type { PageDocument, ProductSummary } from "@ecommerce-landing-saas/shared";
import { fetchLandingPage, LandingPagesApiError } from "../lib/landingPagesApi";
import { fetchProducts, ProductsApiError } from "../lib/productsApi";
import { PageRenderer } from "../features/editor/renderer/PageRenderer";

type State =
  | { phase: "loading" }
  | { phase: "loaded"; document: PageDocument; products: ProductSummary[] }
  | { phase: "error"; message: string };

interface PagePreviewViewProps {
  pageId: string;
  onClose: () => void;
}

/**
 * Standalone preview: fetches the same persisted page document the editor
 * saves and renders it through the exact same canonical PageRenderer, with
 * no editor wrapper supplied — proving the document can be rendered outside
 * the editor shell. Not a publishing surface: still authenticated,
 * still fetched through the same tenant-scoped API as the editor.
 */
export function PagePreviewView({ pageId, onClose }: PagePreviewViewProps): JSX.Element {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [pageRes, productsRes] = await Promise.all([fetchLandingPage(pageId), fetchProducts()]);
        if (cancelled) return;
        setState({ phase: "loaded", document: pageRes.landingPage.config, products: productsRes.items });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof LandingPagesApiError || err instanceof ProductsApiError ? err.message : "Could not load the preview.";
        setState({ phase: "error", message });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return (
    <StandaloneShell onClose={onClose} state={state} />
  );
}

function StandaloneShell({ onClose, state }: { onClose: () => void; state: State }): JSX.Element {
  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <button type="button" onClick={onClose}>
          ← Back
        </button>
      </div>
      {state.phase === "loading" && <p>Loading preview…</p>}
      {state.phase === "error" && <p role="alert">{state.message}</p>}
      {state.phase === "loaded" && <PreviewBody document={state.document} products={state.products} />}
    </div>
  );
}

function PreviewBody({ document, products }: { document: PageDocument; products: ProductSummary[] }): JSX.Element {
  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  // No `renderSectionContainer` — this is the default, production-only path.
  return <PageRenderer document={document} productsById={productsById} />;
}
