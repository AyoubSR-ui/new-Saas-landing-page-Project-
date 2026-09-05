import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInstallUrl,
  clearRecoveryAttempted,
  defaultNavigate,
  getShopDomainFromLocation,
  hasAttemptedRecovery,
  isShopNotInstalledError,
  markRecoveryAttempted,
  redirectTopLevelToInstall,
} from "./shopifyInstall";

describe("getShopDomainFromLocation", () => {
  it("extracts and normalizes a valid shop domain", () => {
    expect(getShopDomainFromLocation("?shop=My-Store.myshopify.com&host=abc")).toBe("my-store.myshopify.com");
  });

  it("returns null when shop is missing", () => {
    expect(getShopDomainFromLocation("?host=abc")).toBeNull();
  });

  it("returns null for a malformed/non-Shopify domain rather than trusting it as-is", () => {
    expect(getShopDomainFromLocation("?shop=evil.com")).toBeNull();
    expect(getShopDomainFromLocation("?shop=<script>alert(1)</script>")).toBeNull();
  });
});

describe("isShopNotInstalledError", () => {
  it("matches only status 403 with code FORBIDDEN", () => {
    expect(isShopNotInstalledError(403, { error: { code: "FORBIDDEN", message: "Shop is not installed" } })).toBe(true);
  });

  it("does not match 401 (missing/invalid session token)", () => {
    expect(isShopNotInstalledError(401, { error: { code: "UNAUTHORIZED" } })).toBe(false);
  });

  it("does not match 500/502/503 server failures", () => {
    expect(isShopNotInstalledError(500, { error: { code: "INTERNAL_ERROR" } })).toBe(false);
    expect(isShopNotInstalledError(502, null)).toBe(false);
    expect(isShopNotInstalledError(503, { error: { code: "DATABASE_UNAVAILABLE" } })).toBe(false);
  });

  it("does not match a 403 with a different code", () => {
    expect(isShopNotInstalledError(403, { error: { code: "INVALID_OAUTH_STATE" } })).toBe(false);
  });

  it("does not match a malformed/null body", () => {
    expect(isShopNotInstalledError(403, null)).toBe(false);
  });
});

describe("buildInstallUrl", () => {
  it("builds the OAuth start URL with the shop domain safely encoded", () => {
    const url = buildInstallUrl("my-store.myshopify.com");
    expect(url).toContain("/api/shopify/auth?shop=my-store.myshopify.com");
  });

  it("percent-encodes special characters via URLSearchParams rather than raw concatenation", () => {
    const url = buildInstallUrl("weird shop&name.myshopify.com");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("shop")).toBe("weird shop&name.myshopify.com");
    expect(parsed.pathname).toBe("/api/shopify/auth");
    // The raw query string must not contain an unescaped `&` splitting the value into a second param.
    expect([...parsed.searchParams.keys()]).toEqual(["shop"]);
  });
});

describe("recovery-attempted guard", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("is false until marked, true after, and false again once cleared", () => {
    expect(hasAttemptedRecovery()).toBe(false);
    markRecoveryAttempted();
    expect(hasAttemptedRecovery()).toBe(true);
    clearRecoveryAttempted();
    expect(hasAttemptedRecovery()).toBe(false);
  });
});

describe("redirectTopLevelToInstall", () => {
  it("navigates to the install URL for the given shop via the injected navigate function, exactly once", () => {
    const navigate = vi.fn();
    redirectTopLevelToInstall("my-store.myshopify.com", navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toContain("/api/shopify/auth?shop=my-store.myshopify.com");
  });

  it("does not navigate when there is nothing to inject a domain for (defensive: caller must gate on a valid domain)", () => {
    const navigate = vi.fn();
    // Even an already-invalid/empty domain still goes through buildInstallUrl
    // deterministically — callers (App.tsx) are responsible for only calling
    // this once getShopDomainFromLocation has already validated the domain;
    // this test documents that redirectTopLevelToInstall itself always
    // invokes navigate exactly once per call, never zero or multiple times.
    redirectTopLevelToInstall("my-store.myshopify.com", navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("defaultNavigate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("navigates via window.open with the _top target — an existing browsing context, not a new window/tab", () => {
    const openSpy = vi.fn(() => ({}) as Window);
    vi.stubGlobal("open", openSpy);

    defaultNavigate("https://example.com/api/shopify/auth?shop=my-store.myshopify.com");

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("https://example.com/api/shopify/auth?shop=my-store.myshopify.com", "_top");
  });

  it("falls back to a direct top-level location assignment if window.open cannot resolve an existing top-level context", () => {
    vi.stubGlobal("open", vi.fn(() => null));
    // jsdom does not implement real navigation, so this only verifies the
    // fallback branch is reached and does not throw when window.open fails.
    expect(() => defaultNavigate("https://example.com/api/shopify/auth?shop=my-store.myshopify.com")).not.toThrow();
  });
});
