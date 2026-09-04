import { shopifyConfig } from "../config.js";

export class TokenExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExchangeError";
  }
}

export interface ExchangedToken {
  accessToken: string;
  scope: string;
}

/**
 * Exchanges an OAuth authorization code for an offline access token.
 * Never logs `code`, the client secret, or the returned token — errors
 * intentionally carry only the HTTP status, not response body content.
 */
export async function exchangeCodeForToken(
  shopDomain: string,
  code: string,
): Promise<ExchangedToken> {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: shopifyConfig.apiKey,
      client_secret: shopifyConfig.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new TokenExchangeError(`Shopify token exchange failed with status ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new TokenExchangeError("Shopify token exchange returned a non-JSON response");
  }

  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>).access_token !== "string" ||
    typeof (data as Record<string, unknown>).scope !== "string"
  ) {
    throw new TokenExchangeError("Shopify token exchange returned an unexpected response shape");
  }

  const { access_token: accessToken, scope } = data as { access_token: string; scope: string };
  return { accessToken, scope };
}
