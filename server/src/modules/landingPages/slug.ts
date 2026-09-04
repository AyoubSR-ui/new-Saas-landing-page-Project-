import { SLUG_PATTERN } from "@ecommerce-landing-saas/shared";

/** Derives a valid slug from a title when the caller didn't supply one. Does not guarantee uniqueness — the caller/service must still check that. */
export function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return SLUG_PATTERN.test(slug) ? slug : "page";
}
