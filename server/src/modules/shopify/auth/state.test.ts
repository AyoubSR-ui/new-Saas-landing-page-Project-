import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => new Map<string, { state: string; shopDomain: string; expiresAt: Date }>());

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    oAuthState: {
      create: vi.fn(async ({ data }: { data: { state: string; shopDomain: string; expiresAt: Date } }) => {
        db.set(data.state, data);
        return { id: "state-id", ...data, createdAt: new Date() };
      }),
      findUnique: vi.fn(async ({ where }: { where: { state: string } }) => {
        const record = db.get(where.state);
        return record ? { id: "state-id", ...record, createdAt: new Date() } : null;
      }),
      delete: vi.fn(async ({ where }: { where: { state: string } }) => {
        db.delete(where.state);
      }),
    },
  },
}));

const { createOAuthState, consumeOAuthState } = await import("./state.js");

describe("OAuth state", () => {
  beforeEach(() => {
    db.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a unique, unguessable state value and persists it", async () => {
    const stateA = await createOAuthState("shop-a.myshopify.com");
    const stateB = await createOAuthState("shop-b.myshopify.com");

    expect(stateA).not.toBe(stateB);
    expect(stateA.length).toBeGreaterThanOrEqual(32);
    expect(db.has(stateA)).toBe(true);
  });

  it("consumes a valid state exactly once", async () => {
    const state = await createOAuthState("my-shop.myshopify.com");

    await expect(consumeOAuthState(state, "my-shop.myshopify.com")).resolves.toBe(true);
    // Second attempt: already deleted -> invalid.
    await expect(consumeOAuthState(state, "my-shop.myshopify.com")).resolves.toBe(false);
  });

  it("rejects a state that was never issued", async () => {
    await expect(consumeOAuthState("never-issued", "my-shop.myshopify.com")).resolves.toBe(false);
  });

  it("rejects a state presented for the wrong shop", async () => {
    const state = await createOAuthState("real-shop.myshopify.com");

    await expect(consumeOAuthState(state, "attacker-shop.myshopify.com")).resolves.toBe(false);
    // Also consumed (deleted) even though shop mismatched -> can't be retried.
    await expect(consumeOAuthState(state, "real-shop.myshopify.com")).resolves.toBe(false);
  });

  it("rejects an expired state", async () => {
    vi.useFakeTimers();
    const state = await createOAuthState("my-shop.myshopify.com");

    vi.advanceTimersByTime(11 * 60 * 1000);

    await expect(consumeOAuthState(state, "my-shop.myshopify.com")).resolves.toBe(false);
  });
});
