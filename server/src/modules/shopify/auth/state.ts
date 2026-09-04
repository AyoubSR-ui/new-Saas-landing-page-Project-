import { randomBytes } from "node:crypto";
import { prisma } from "../../../db/prisma.js";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Generates and persists a single-use, unguessable OAuth state value bound
 * to a specific shop. The random value itself (not a cookie/session) is
 * what prevents CSRF: an attacker cannot produce a valid state without
 * Shopify having issued it back through a real authorize redirect.
 */
export async function createOAuthState(shopDomain: string): Promise<string> {
  const state = randomBytes(32).toString("base64url");

  await prisma.oAuthState.create({
    data: {
      state,
      shopDomain,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  return state;
}

/**
 * Validates and consumes (deletes) a state value in one step, so it can
 * never be replayed regardless of whether validation succeeds or fails.
 * Returns true only if the state exists, is unexpired, and belongs to the
 * shop that presented it.
 */
export async function consumeOAuthState(state: string, shopDomain: string): Promise<boolean> {
  const record = await prisma.oAuthState.findUnique({ where: { state } });

  if (!record) {
    return false;
  }

  await prisma.oAuthState.delete({ where: { state } });

  if (record.expiresAt.getTime() < Date.now()) {
    return false;
  }

  return record.shopDomain === shopDomain;
}
