import jwt from "jsonwebtoken";
import { shopifyConfig } from "../config.js";
import { InvalidShopDomainError, normalizeShopDomain } from "./shopDomain.js";

export class InvalidSessionTokenError extends Error {
  constructor(message = "Invalid Shopify session token") {
    super(message);
    this.name = "InvalidSessionTokenError";
  }
}

export interface VerifiedSessionToken {
  shopDomain: string;
  userId: string | undefined;
}

/**
 * Verifies a Shopify App Bridge session token (JWT, HS256-signed with the
 * app's client secret). The shop identity comes ONLY from the token's
 * verified `dest` claim — this is what makes the shop unspoofable via a
 * client-supplied query/body parameter.
 */
export function verifySessionToken(token: string): VerifiedSessionToken {
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, shopifyConfig.apiSecret, {
      algorithms: ["HS256"],
      audience: shopifyConfig.apiKey,
      clockTolerance: 5,
    });
    if (typeof decoded === "string") {
      throw new InvalidSessionTokenError();
    }
    payload = decoded;
  } catch {
    throw new InvalidSessionTokenError();
  }

  const { dest, iss } = payload;
  if (typeof dest !== "string" || typeof iss !== "string") {
    throw new InvalidSessionTokenError();
  }

  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(dest.replace(/^https:\/\//, ""));
  } catch (err) {
    if (err instanceof InvalidShopDomainError) {
      throw new InvalidSessionTokenError();
    }
    throw err;
  }

  // Defense in depth: `dest` and `iss` must refer to the same shop.
  if (iss !== `https://${shopDomain}/admin`) {
    throw new InvalidSessionTokenError();
  }

  const userId = typeof payload.sub === "string" ? payload.sub : undefined;

  return { shopDomain, userId };
}
