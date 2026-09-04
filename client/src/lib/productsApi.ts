import type { ProductListResponse, ProductSyncResponse } from "@ecommerce-landing-saas/shared";
import { fetchWithSessionToken } from "./api";

export class ProductsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductsApiError";
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ProductsApiError(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchProducts(): Promise<ProductListResponse> {
  const res = await fetchWithSessionToken("/api/products");
  return parseOrThrow<ProductListResponse>(res);
}

export async function triggerProductSync(): Promise<ProductSyncResponse> {
  const res = await fetchWithSessionToken("/api/products/sync", { method: "POST" });
  return parseOrThrow<ProductSyncResponse>(res);
}
