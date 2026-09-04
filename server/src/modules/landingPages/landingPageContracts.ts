import {
  LandingPageDetailResponseSchema,
  LandingPageListResponseSchema,
  type LandingPageConfig,
  type LandingPageDetail,
  type LandingPageDetailResponse,
  type LandingPageListResponse,
  type LandingPageProductRef,
  type LandingPageSummary,
} from "@ecommerce-landing-saas/shared";
import type { LandingPageWithProducts } from "./landingPageRepository.js";

function toProductRef(link: LandingPageWithProducts["productLinks"][number]): LandingPageProductRef {
  const [featuredImage] = link.product.images;
  return {
    id: link.product.id,
    title: link.product.title,
    handle: link.product.handle,
    featuredImage: featuredImage
      ? { id: featuredImage.id, url: featuredImage.url, altText: featuredImage.altText, position: featuredImage.position }
      : null,
  };
}

function toSummary(page: LandingPageWithProducts): LandingPageSummary {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    status: page.status,
    productCount: page.productLinks.length,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

function toDetail(page: LandingPageWithProducts): LandingPageDetail {
  return {
    ...toSummary(page),
    config: page.config as LandingPageConfig,
    products: page.productLinks.map(toProductRef),
  };
}

export function toLandingPageListResponse(items: LandingPageWithProducts[], nextCursor: string | null): LandingPageListResponse {
  return LandingPageListResponseSchema.parse({
    items: items.map(toSummary),
    nextCursor,
  });
}

export function toLandingPageDetailResponse(page: LandingPageWithProducts): LandingPageDetailResponse {
  return LandingPageDetailResponseSchema.parse({ landingPage: toDetail(page) });
}
