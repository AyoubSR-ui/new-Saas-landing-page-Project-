import type {
  HeroSection as HeroSectionType,
  ImageSection as ImageSectionType,
  ProductShowcaseSection as ProductShowcaseSectionType,
  ProductSummary,
  TextSection as TextSectionType,
} from "@ecommerce-landing-saas/shared";

// Plain semantic markup only — no `dangerouslySetInnerHTML` anywhere in
// this module. Text content is rendered as React text nodes (auto-escaped)
// and URLs are only ever used as `href`/`src` attributes, never evaluated.

export function HeroSection({ section }: { section: HeroSectionType }): JSX.Element {
  const { headline, subheadline, ctaText, ctaTarget, imageUrl, imageAlt, alignment } = section.props;
  return (
    <div style={{ textAlign: alignment }}>
      {imageUrl && <img src={imageUrl} alt={imageAlt ?? ""} style={{ maxWidth: "100%", height: "auto" }} />}
      <h1>{headline}</h1>
      {subheadline && <p>{subheadline}</p>}
      {ctaText && ctaTarget && <a href={ctaTarget}>{ctaText}</a>}
    </div>
  );
}

export function TextSection({ section }: { section: TextSectionType }): JSX.Element {
  const { heading, body, alignment } = section.props;
  return (
    <div style={{ textAlign: alignment }}>
      {heading && <h2>{heading}</h2>}
      {body.split("\n").map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
}

export function ImageSection({ section }: { section: ImageSectionType }): JSX.Element {
  const { url, altText, linkUrl, alignment } = section.props;
  const image = <img src={url} alt={altText} style={{ maxWidth: "100%", height: "auto" }} />;
  return <div style={{ textAlign: alignment }}>{linkUrl ? <a href={linkUrl}>{image}</a> : image}</div>;
}

export function ProductShowcaseSection({
  section,
  productsById,
}: {
  section: ProductShowcaseSectionType;
  productsById: Record<string, ProductSummary>;
}): JSX.Element {
  const { heading, productIds, displayStyle } = section.props;
  return (
    <div>
      {heading && <h2>{heading}</h2>}
      <ul
        style={{
          display: displayStyle === "grid" ? "grid" : "block",
          gridTemplateColumns: displayStyle === "grid" ? "repeat(auto-fit, minmax(140px, 1fr))" : undefined,
          gap: displayStyle === "grid" ? "1rem" : undefined,
          listStyle: "none",
          padding: 0,
        }}
      >
        {productIds.map((id) => {
          const product = productsById[id];
          return (
            <li key={id}>
              {product ? (
                <>
                  {product.featuredImage && (
                    <img
                      src={product.featuredImage.url}
                      alt={product.featuredImage.altText ?? product.title}
                      width={120}
                      height={120}
                      style={{ objectFit: "cover" }}
                    />
                  )}
                  <div>{product.title}</div>
                </>
              ) : (
                <em>Product unavailable</em>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
