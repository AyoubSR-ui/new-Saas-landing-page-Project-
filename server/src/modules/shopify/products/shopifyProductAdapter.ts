import { shopifyAdminApiRequest, ShopifyApiError, ShopNotInstalledError } from "../client/shopifyClient.js";
import { toShopifyGid } from "./types.js";
import type { NormalizedProduct, NormalizedProductStatus, NormalizedVariant, NormalizedProductImage } from "./types.js";

const PRODUCTS_PAGE_SIZE = 50;
const VARIANTS_PER_PRODUCT = 100;
const IMAGES_PER_PRODUCT = 20;

const PRODUCTS_QUERY = `
  query SyncProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          status
          images(first: ${IMAGES_PER_PRODUCT}) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          variants(first: ${VARIANTS_PER_PRODUCT}) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface RawGraphQLImageNode {
  id: unknown;
  url: unknown;
  altText: unknown;
}

interface RawGraphQLVariantNode {
  id: unknown;
  title: unknown;
  sku: unknown;
  price: unknown;
  compareAtPrice: unknown;
  inventoryQuantity: unknown;
  selectedOptions: unknown;
}

interface RawGraphQLProductNode {
  id: unknown;
  title: unknown;
  handle: unknown;
  descriptionHtml: unknown;
  vendor: unknown;
  productType: unknown;
  status: unknown;
  images: { edges: { node: RawGraphQLImageNode }[] };
  variants: { edges: { node: RawGraphQLVariantNode }[] };
}

interface GraphQLProductsResponse {
  data?: {
    products: {
      edges: { node: RawGraphQLProductNode }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: { message: string }[];
}

export class ShopifyProductAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyProductAdapterError";
  }
}

const VALID_STATUSES: readonly NormalizedProductStatus[] = ["ACTIVE", "ARCHIVED", "DRAFT"];

function normalizeStatus(raw: unknown): NormalizedProductStatus {
  return typeof raw === "string" && (VALID_STATUSES as readonly string[]).includes(raw)
    ? (raw as NormalizedProductStatus)
    : "DRAFT";
}

function normalizeImage(node: RawGraphQLImageNode): NormalizedProductImage | null {
  if (typeof node.id !== "string" || typeof node.url !== "string") {
    return null;
  }
  return {
    shopifyImageId: toShopifyGid("ProductImage", node.id),
    url: node.url,
    altText: typeof node.altText === "string" ? node.altText : null,
    position: 0, // set by index once ordered — GraphQL edges preserve Shopify's own image order.
  };
}

function normalizeVariant(node: RawGraphQLVariantNode): NormalizedVariant | null {
  if (typeof node.id !== "string" || typeof node.price !== "string") {
    return null;
  }
  const selectedOptions = Array.isArray(node.selectedOptions)
    ? node.selectedOptions
        .filter(
          (opt): opt is { name: string; value: string } =>
            typeof opt === "object" &&
            opt !== null &&
            typeof (opt as { name?: unknown }).name === "string" &&
            typeof (opt as { value?: unknown }).value === "string",
        )
        .map((opt) => ({ name: opt.name, value: opt.value }))
    : [];

  return {
    shopifyVariantId: toShopifyGid("ProductVariant", node.id),
    title: typeof node.title === "string" && node.title.length > 0 ? node.title : "Default Title",
    sku: typeof node.sku === "string" && node.sku.length > 0 ? node.sku : null,
    price: node.price,
    compareAtPrice: typeof node.compareAtPrice === "string" ? node.compareAtPrice : null,
    inventoryQuantity: typeof node.inventoryQuantity === "number" ? node.inventoryQuantity : null,
    selectedOptions,
  };
}

export function normalizeGraphQLProduct(node: RawGraphQLProductNode): NormalizedProduct {
  if (typeof node.id !== "string" || typeof node.title !== "string" || typeof node.handle !== "string") {
    throw new ShopifyProductAdapterError("Shopify product response is missing required fields");
  }

  const images = (node.images?.edges ?? [])
    .map((edge) => normalizeImage(edge.node))
    .filter((img): img is NormalizedProductImage => img !== null)
    .map((img, index) => ({ ...img, position: index }));

  const variants = (node.variants?.edges ?? [])
    .map((edge) => normalizeVariant(edge.node))
    .filter((variant): variant is NormalizedVariant => variant !== null);

  return {
    shopifyProductId: toShopifyGid("Product", node.id),
    title: node.title,
    handle: node.handle,
    description: typeof node.descriptionHtml === "string" && node.descriptionHtml.length > 0 ? node.descriptionHtml : null,
    vendor: typeof node.vendor === "string" && node.vendor.length > 0 ? node.vendor : null,
    productType: typeof node.productType === "string" && node.productType.length > 0 ? node.productType : null,
    status: normalizeStatus(node.status),
    images,
    variants,
  };
}

interface ProductsPage {
  products: NormalizedProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
}

async function fetchProductsPage(shopDomain: string, after: string | null): Promise<ProductsPage> {
  let raw: unknown;
  try {
    raw = await shopifyAdminApiRequest(shopDomain, "/graphql.json", {
      method: "POST",
      body: { query: PRODUCTS_QUERY, variables: { first: PRODUCTS_PAGE_SIZE, after } },
    });
  } catch (err) {
    if (err instanceof ShopifyApiError || err instanceof ShopNotInstalledError) {
      throw err;
    }
    throw new ShopifyProductAdapterError("Failed to query Shopify products");
  }

  const response = raw as GraphQLProductsResponse;

  if (response.errors && response.errors.length > 0) {
    throw new ShopifyApiError(
      `Shopify GraphQL product query returned errors: ${response.errors.map((e) => e.message).join("; ")}`,
      200,
    );
  }

  if (!response.data?.products) {
    throw new ShopifyProductAdapterError("Shopify GraphQL product query returned an unexpected response shape");
  }

  const { edges, pageInfo } = response.data.products;

  return {
    products: edges.map((edge) => normalizeGraphQLProduct(edge.node)),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
}

/**
 * Pages through every product in the shop's catalog via Shopify's Admin
 * GraphQL API, yielding one normalized page at a time so a caller (the sync
 * job) can persist incrementally instead of holding the entire catalog in
 * memory. Does not assume a shop has fewer than one page of products.
 */
export async function* iterateShopifyProducts(shopDomain: string): AsyncGenerator<NormalizedProduct[]> {
  let after: string | null = null;
  for (;;) {
    const page = await fetchProductsPage(shopDomain, after);
    yield page.products;
    if (!page.hasNextPage) {
      return;
    }
    after = page.endCursor;
  }
}
