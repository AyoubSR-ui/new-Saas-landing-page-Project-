import {
  LandingPageDetailResponseSchema,
  LandingPageListResponseSchema,
  type LandingPageDetail,
  type LandingPageDetailResponse,
  type LandingPageListResponse,
  type LandingPageProductRef,
  type LandingPageSummary,
} from "@ecommerce-landing-saas/shared";
import type { LandingPageWithDocument } from "./landingPageService.js";

function toProductRef(link: LandingPageWithDocument["productLinks"][number]): LandingPageProductRef {
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

function toSummary(page: LandingPageWithDocument): LandingPageSummary {
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

function toDetail(page: LandingPageWithDocument): LandingPageDetail {
  return {
    ...toSummary(page),
    config: page.config,
    products: page.productLinks.map(toProductRef),
  };
}

export function toLandingPageListResponse(items: LandingPageWithDocument[], nextCursor: string | null): LandingPageListResponse {
  return LandingPageListResponseSchema.parse({
    items: items.map(toSummary),
    nextCursor,
  });
}

export function toLandingPageDetailResponse(page: LandingPageWithDocument): LandingPageDetailResponse {
  return LandingPageDetailResponseSchema.parse({ landingPage: toDetail(page) });
}
