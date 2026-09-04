export interface ShopifyGlobal {
  idToken: () => Promise<string>;
}

declare global {
  interface Window {
    shopify?: ShopifyGlobal;
  }
}

/** True when running inside an iframe (i.e. embedded in Shopify admin). */
export function isEmbedded(): boolean {
  return typeof window !== "undefined" && window.top !== window.self;
}

export function getShopifyGlobal(): ShopifyGlobal | undefined {
  return typeof window !== "undefined" ? window.shopify : undefined;
}
