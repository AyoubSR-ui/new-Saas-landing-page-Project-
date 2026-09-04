import { useEffect, useState } from "react";
import { fetchWithSessionToken } from "../lib/api";
import { getShopifyGlobal, isEmbedded } from "../lib/shopify";
import { ProductsPanel } from "./ProductsPanel";

type Status =
  | { phase: "checking" }
  | { phase: "not-embedded" }
  | { phase: "loading" }
  | { phase: "success"; shop: string }
  | { phase: "error"; message: string };

const APP_BRIDGE_READY_TIMEOUT_MS = 5000;
const APP_BRIDGE_POLL_INTERVAL_MS = 100;

async function waitForAppBridge(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < APP_BRIDGE_READY_TIMEOUT_MS) {
    if (getShopifyGlobal()) return true;
    await new Promise((resolve) => setTimeout(resolve, APP_BRIDGE_POLL_INTERVAL_MS));
  }
  return Boolean(getShopifyGlobal());
}

export function App(): JSX.Element {
  const [status, setStatus] = useState<Status>({ phase: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      if (!isEmbedded()) {
        if (!cancelled) setStatus({ phase: "not-embedded" });
        return;
      }

      if (!cancelled) setStatus({ phase: "loading" });

      const ready = await waitForAppBridge();
      if (cancelled) return;
      if (!ready) {
        setStatus({ phase: "error", message: "Shopify App Bridge failed to initialize." });
        return;
      }

      try {
        const res = await fetchWithSessionToken("/api/shopify/session");
        if (cancelled) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setStatus({ phase: "error", message: body?.error?.message ?? `Request failed (${res.status})` });
          return;
        }

        const data = (await res.json()) as { shop?: string };
        setStatus({ phase: "success", shop: data.shop ?? "unknown shop" });
      } catch {
        if (!cancelled) setStatus({ phase: "error", message: "Could not reach the app server." });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>E-Commerce Landing Page SaaS</h1>
      {status.phase === "checking" && <p>Checking environment…</p>}
      {status.phase === "not-embedded" && (
        <p>Open this app from your Shopify admin to continue.</p>
      )}
      {status.phase === "loading" && <p>Connecting to Shopify…</p>}
      {status.phase === "success" && (
        <>
          <p>Installation successful — connected to {status.shop}.</p>
          <ProductsPanel />
        </>
      )}
      {status.phase === "error" && <p role="alert">Something went wrong: {status.message}</p>}
    </main>
  );
}
