import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolate App.tsx's own OAuth-recovery wiring from the child feature panels
// (which perform their own, unrelated network calls once "success" renders).
vi.mock("./ProductsPanel", () => ({ ProductsPanel: () => <div>products-panel</div> }));
vi.mock("./LandingPagesPanel", () => ({ LandingPagesPanel: () => <div>landing-pages-panel</div> }));
vi.mock("../features/editor/LandingPageEditor", () => ({ LandingPageEditor: () => <div>editor</div> }));
vi.mock("./PagePreviewView", () => ({ PagePreviewView: () => <div>preview</div> }));

vi.mock("../lib/shopify", () => ({
  isEmbedded: () => true,
  getShopifyGlobal: () => ({ idToken: async () => "fake-session-token" }),
}));

const install = vi.hoisted(() => ({
  isShopNotInstalledError: vi.fn(),
  getShopDomainFromLocation: vi.fn(),
  hasAttemptedRecovery: vi.fn(),
  markRecoveryAttempted: vi.fn(),
  clearRecoveryAttempted: vi.fn(),
  redirectTopLevelToInstall: vi.fn(),
}));
vi.mock("../lib/shopifyInstall", () => install);

const { App } = await import("./App");

function mockFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("App — Shopify session / OAuth recovery wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    install.isShopNotInstalledError.mockReturnValue(false);
    install.hasAttemptedRecovery.mockReturnValue(false);
    install.getShopDomainFromLocation.mockReturnValue("my-store.myshopify.com");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the dashboard normally on a successful session response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockFetchResponse(200, { shop: "my-store.myshopify.com" })));

    render(<App />);

    await waitFor(() => expect(screen.getByText(/connected to my-store\.myshopify\.com/i)).toBeInTheDocument());
    expect(install.redirectTopLevelToInstall).not.toHaveBeenCalled();
    expect(install.clearRecoveryAttempted).toHaveBeenCalled();
  });

  it("initiates OAuth recovery on a 403 'shop is not installed' response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockFetchResponse(403, { error: { code: "FORBIDDEN", message: "Shop is not installed" } })),
    );
    install.isShopNotInstalledError.mockReturnValue(true);

    render(<App />);

    await waitFor(() => expect(install.redirectTopLevelToInstall).toHaveBeenCalledWith("my-store.myshopify.com"));
    expect(install.markRecoveryAttempted).toHaveBeenCalled();
    // Must not fall through to rendering the raw error text once recovery is initiated.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not initiate OAuth recovery for a 401 (missing/invalid session token)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockFetchResponse(401, { error: { code: "UNAUTHORIZED", message: "Missing bearer session token" } })),
    );
    install.isShopNotInstalledError.mockReturnValue(false);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Missing bearer session token"));
    expect(install.redirectTopLevelToInstall).not.toHaveBeenCalled();
  });

  it("does not initiate OAuth recovery for a 500/502/503 server failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockFetchResponse(503, { error: { code: "DATABASE_UNAVAILABLE", message: "Database is not reachable" } })));
    install.isShopNotInstalledError.mockReturnValue(false);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Database is not reachable"));
    expect(install.redirectTopLevelToInstall).not.toHaveBeenCalled();
  });

  it("does not redirect again if recovery was already attempted this tab session (loop prevention)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockFetchResponse(403, { error: { code: "FORBIDDEN", message: "Shop is not installed" } })),
    );
    install.isShopNotInstalledError.mockReturnValue(true);
    install.hasAttemptedRecovery.mockReturnValue(true);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Shop is not installed"));
    expect(install.redirectTopLevelToInstall).not.toHaveBeenCalled();
  });

  it("falls back to showing the error if the shop domain cannot be determined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockFetchResponse(403, { error: { code: "FORBIDDEN", message: "Shop is not installed" } })),
    );
    install.isShopNotInstalledError.mockReturnValue(true);
    install.getShopDomainFromLocation.mockReturnValue(null);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Shop is not installed"));
    expect(install.redirectTopLevelToInstall).not.toHaveBeenCalled();
  });
});
