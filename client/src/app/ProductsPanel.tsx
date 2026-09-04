import { useCallback, useEffect, useState } from "react";
import type { ProductSummary } from "@ecommerce-landing-saas/shared";
import { fetchProducts, ProductsApiError, triggerProductSync } from "../lib/productsApi";

type State =
  | { phase: "loading" }
  | { phase: "loaded"; items: ProductSummary[] }
  | { phase: "error"; message: string };

// Minimal product-selection foundation for Phase 2 — proves the sync/list
// pipeline works end to end. Not the landing-page editor: no selection,
// filtering, or page-building behavior lives here yet.
export function ProductsPanel(): JSX.Element {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const data = await fetchProducts();
      setState({ phase: "loaded", items: data.items });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof ProductsApiError ? err.message : "Could not load products.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSync(): Promise<void> {
    setSyncing(true);
    try {
      await triggerProductSync();
      await load();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof ProductsApiError ? err.message : "Sync failed.",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section>
      <h2>Products</h2>
      <button type="button" onClick={() => void handleSync()} disabled={syncing}>
        {syncing ? "Syncing…" : "Sync products from Shopify"}
      </button>

      {state.phase === "loading" && <p>Loading products…</p>}
      {state.phase === "error" && <p role="alert">{state.message}</p>}
      {state.phase === "loaded" && state.items.length === 0 && (
        <p>No products yet — run a sync to pull your catalog from Shopify.</p>
      )}
      {state.phase === "loaded" && state.items.length > 0 && (
        <ul>
          {state.items.map((product) => (
            <li key={product.id}>
              {product.featuredImage && (
                <img
                  src={product.featuredImage.url}
                  alt={product.featuredImage.altText ?? product.title}
                  width={64}
                  height={64}
                />
              )}
              <strong>{product.title}</strong>
              {product.vendor && <span> — {product.vendor}</span>}
              {product.priceRange && (
                <span>
                  {" "}
                  ·{" "}
                  {product.priceRange.min === product.priceRange.max
                    ? product.priceRange.min
                    : `${product.priceRange.min}–${product.priceRange.max}`}
                </span>
              )}
              <span> · {product.variantCount} variant{product.variantCount === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
