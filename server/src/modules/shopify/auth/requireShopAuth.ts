import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../../../utils/errors.js";
import { findShopByDomain } from "../db/shopRepository.js";
import { InvalidSessionTokenError, verifySessionToken } from "./sessionToken.js";

export interface AuthenticatedShop {
  id: string;
  shopDomain: string;
}

declare module "express-serve-static-core" {
  interface Request {
    shop?: AuthenticatedShop;
  }
}

/**
 * Authenticates embedded-app requests via a Shopify App Bridge session
 * token. The resolved shop comes exclusively from the token's verified
 * claims — never from a query/body/header value the client controls — and
 * is rejected outright if that shop isn't installed (or was uninstalled).
 */
export async function requireShopAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new UnauthorizedError("Missing bearer session token"));
    return;
  }

  let shopDomain: string;
  try {
    ({ shopDomain } = verifySessionToken(token));
  } catch (err) {
    if (err instanceof InvalidSessionTokenError) {
      next(new UnauthorizedError("Invalid or expired session token"));
      return;
    }
    next(err);
    return;
  }

  const shop = await findShopByDomain(shopDomain);

  if (!shop || shop.status !== "INSTALLED") {
    next(new ForbiddenError("Shop is not installed"));
    return;
  }

  req.shop = { id: shop.id, shopDomain: shop.shopDomain };
  next();
}
