import { prisma } from "../../../db/prisma.js";
import type { Shop } from "../../../../prisma/generated/index.js";

export type { Shop };

export function findShopByDomain(shopDomain: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { shopDomain } });
}

/**
 * Creates the shop record on first install, or reactivates + refreshes it
 * on a reinstall (Shopify issues a fresh offline token each time a merchant
 * (re)installs). Always leaves the shop in `INSTALLED` state.
 */
export function upsertInstalledShop(params: {
  shopDomain: string;
  accessTokenCiphertext: string;
  scopes: string;
}): Promise<Shop> {
  const { shopDomain, accessTokenCiphertext, scopes } = params;

  return prisma.shop.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      accessTokenCiphertext,
      scopes,
      status: "INSTALLED",
    },
    update: {
      accessTokenCiphertext,
      scopes,
      status: "INSTALLED",
      uninstalledAt: null,
    },
  });
}

/**
 * Idempotent uninstall: a shop that is already `UNINSTALLED` (or that we
 * have no record of) is left untouched rather than erroring, so a repeated
 * webhook delivery is always safe to process again. Nulls the ciphertext so
 * the offline token is unusable at the data layer, not just gated by status
 * checks in application code.
 */
export async function markShopUninstalled(shopDomain: string): Promise<Shop | null> {
  const existing = await prisma.shop.findUnique({ where: { shopDomain } });

  if (!existing) {
    return null;
  }

  if (existing.status === "UNINSTALLED") {
    return existing;
  }

  return prisma.shop.update({
    where: { shopDomain },
    data: {
      status: "UNINSTALLED",
      uninstalledAt: new Date(),
      accessTokenCiphertext: null,
    },
  });
}
