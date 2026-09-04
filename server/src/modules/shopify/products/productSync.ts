import { iterateShopifyProducts } from "./shopifyProductAdapter.js";
import { deactivateProductsNotIn, upsertProduct } from "./productRepository.js";

export interface SyncResult {
  productsSeen: number;
  productsCreated: number;
  productsUpdated: number;
  productsDeactivated: number;
}

/**
 * Runs a full, idempotent product sync for one authenticated shop: pages
 * through Shopify's catalog (via the GraphQL adapter), upserting each page
 * as it arrives rather than buffering the whole catalog in memory, then
 * deactivates any previously-synced product not seen in this run. If any
 * page fails to fetch, the whole sync aborts *before* deactivation — a
 * partial/failed fetch must never be mistaken for "these products no longer
 * exist."
 */
export async function syncShopProducts(shop: { id: string; shopDomain: string }): Promise<SyncResult> {
  const seenShopifyProductIds: string[] = [];
  let created = 0;
  let updated = 0;

  for await (const page of iterateShopifyProducts(shop.shopDomain)) {
    for (const normalized of page) {
      seenShopifyProductIds.push(normalized.shopifyProductId);
      const { wasCreated } = await upsertProduct(shop.id, normalized);
      if (wasCreated) {
        created += 1;
      } else {
        updated += 1;
      }
    }
  }

  const deactivated = await deactivateProductsNotIn(shop.id, seenShopifyProductIds);

  return {
    productsSeen: seenShopifyProductIds.length,
    productsCreated: created,
    productsUpdated: updated,
    productsDeactivated: deactivated,
  };
}
