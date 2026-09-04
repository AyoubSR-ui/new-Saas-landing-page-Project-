import { getShopifyGlobal } from "./shopify";

export class SessionTokenUnavailableError extends Error {
  constructor() {
    super("Shopify App Bridge session token is unavailable");
    this.name = "SessionTokenUnavailableError";
  }
}

/**
 * Fetches an app API path with the current App Bridge session token
 * attached as a bearer credential. Throws before ever making the request
 * if App Bridge hasn't initialized (e.g. the page isn't actually embedded).
 */
export async function fetchWithSessionToken(path: string, init: RequestInit = {}): Promise<Response> {
  const shopify = getShopifyGlobal();
  if (!shopify) {
    throw new SessionTokenUnavailableError();
  }

  const token = await shopify.idToken();

  return fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
