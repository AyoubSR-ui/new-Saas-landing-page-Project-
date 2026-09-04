import { shopifyConfig } from "../config.js";
import { findShopByDomain } from "../db/shopRepository.js";
import { decryptToken } from "../security/tokenCipher.js";

export class ShopifyApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
  }
}

export class ShopNotInstalledError extends Error {
  constructor(shopDomain: string) {
    super(`Shop ${shopDomain} is not installed`);
    this.name = "ShopNotInstalledError";
  }
}

interface AdminApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

/**
 * Minimal, centralized Shopify Admin API request helper. Loads and decrypts
 * the shop's offline token only for the duration of this call, and never
 * includes it in a thrown error or log line. Business-domain API calls
 * (products, etc.) are built on top of this in later phases — this phase
 * only proves the plumbing works.
 */
export async function shopifyAdminApiRequest(
  shopDomain: string,
  path: string,
  options: AdminApiRequestOptions = {},
): Promise<unknown> {
  const shop = await findShopByDomain(shopDomain);
  if (!shop || shop.status !== "INSTALLED" || !shop.accessTokenCiphertext) {
    throw new ShopNotInstalledError(shopDomain);
  }

  const accessToken = decryptToken(shop.accessTokenCiphertext);
  const url = `https://${shopDomain}/admin/api/${shopifyConfig.apiVersion}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ShopifyApiError("Shopify Admin API request failed: network error", 0);
  }

  if (!response.ok) {
    throw new ShopifyApiError(
      `Shopify Admin API request failed with status ${response.status}`,
      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ShopifyApiError("Shopify Admin API returned a non-JSON response", response.status);
  }
}
