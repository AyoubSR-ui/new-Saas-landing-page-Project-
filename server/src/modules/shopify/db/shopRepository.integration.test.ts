import { describe, expect, it } from "vitest";
import { prisma } from "../../../db/prisma.js";
import { decryptToken, encryptToken } from "../security/tokenCipher.js";
import { findShopByDomain, markShopUninstalled, upsertInstalledShop } from "./shopRepository.js";

// This suite exercises the real Prisma client against a real PostgreSQL
// database (no mocks) — the "at least one integration-level verification
// of the real application/database path" the phase requires. It self-skips
// with a clear message if no reachable database is configured, rather than
// pretending to pass. The connectivity check must happen before test
// collection (top-level await), since describe.runIf needs a resolved
// boolean, not a value set later inside a hook.
let dbAvailable = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbAvailable = true;
} catch {
  console.warn(
    "[shopRepository.integration.test] Skipping: no reachable PostgreSQL at " +
      `${process.env.DATABASE_URL ?? "(DATABASE_URL unset)"}. ` +
      "Start a real Postgres and re-run tests to exercise the real database path.",
  );
}

describe.runIf(dbAvailable)("shopRepository (real database)", () => {
  const domainA = `integration-test-a-${Date.now()}.myshopify.com`;
  const domainB = `integration-test-b-${Date.now()}.myshopify.com`;

  it("enforces shop domain uniqueness at the database level", async () => {
    await upsertInstalledShop({
      shopDomain: domainA,
      accessTokenCiphertext: encryptToken("shpat_first"),
      scopes: "read_products",
    });

    // A second create with the same shopDomain must not succeed as a raw
    // create (upsert legitimately updates) — assert the unique index exists
    // by attempting a raw create directly.
    await expect(
      prisma.shop.create({
        data: { shopDomain: domainA, status: "INSTALLED" },
      }),
    ).rejects.toThrow();
  });

  it("persists the access token only as ciphertext, and it decrypts correctly", async () => {
    const plaintext = "shpat_super_secret_token_value";
    await upsertInstalledShop({
      shopDomain: domainB,
      accessTokenCiphertext: encryptToken(plaintext),
      scopes: "read_products",
    });

    const stored = await findShopByDomain(domainB);
    expect(stored).not.toBeNull();
    expect(stored?.accessTokenCiphertext).not.toBe(plaintext);
    expect(stored?.accessTokenCiphertext).not.toContain(plaintext);
    expect(decryptToken(stored?.accessTokenCiphertext as string)).toBe(plaintext);
  });

  it("transitions install -> uninstall -> reinstall correctly", async () => {
    await upsertInstalledShop({
      shopDomain: domainA,
      accessTokenCiphertext: encryptToken("shpat_v1"),
      scopes: "read_products",
    });
    let shop = await findShopByDomain(domainA);
    expect(shop?.status).toBe("INSTALLED");

    await markShopUninstalled(domainA);
    shop = await findShopByDomain(domainA);
    expect(shop?.status).toBe("UNINSTALLED");
    expect(shop?.uninstalledAt).not.toBeNull();
    expect(shop?.accessTokenCiphertext).toBeNull();

    await upsertInstalledShop({
      shopDomain: domainA,
      accessTokenCiphertext: encryptToken("shpat_v2_after_reinstall"),
      scopes: "read_products,write_products",
    });
    shop = await findShopByDomain(domainA);
    expect(shop?.status).toBe("INSTALLED");
    expect(shop?.uninstalledAt).toBeNull();
    expect(shop && decryptToken(shop.accessTokenCiphertext as string)).toBe(
      "shpat_v2_after_reinstall",
    );
  });
});
