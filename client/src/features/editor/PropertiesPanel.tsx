import type { Alignment, PageSection, ProductSummary } from "@ecommerce-landing-saas/shared";

interface PropertiesPanelProps {
  section: PageSection | null;
  products: ProductSummary[];
  onUpdateProps: (id: string, props: Record<string, unknown>) => void;
  onUpdateSettings: (id: string, settings: Record<string, unknown>) => void;
}

const ALIGNMENTS: Alignment[] = ["left", "center", "right"];

function AlignmentField({ value, onChange }: { value: Alignment; onChange: (value: Alignment) => void }): JSX.Element {
  return (
    <label>
      Alignment{" "}
      <select value={value} onChange={(e) => onChange(e.target.value as Alignment)}>
        {ALIGNMENTS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PropertiesPanel({ section, products, onUpdateProps, onUpdateSettings }: PropertiesPanelProps): JSX.Element {
  if (!section) {
    return (
      <div>
        <h3>Properties</h3>
        <p>Select a section to edit its properties.</p>
      </div>
    );
  }

  const updateProps = (props: Record<string, unknown>) => onUpdateProps(section.id, props);
  const updateSettings = (settings: Record<string, unknown>) => onUpdateSettings(section.id, settings);

  return (
    <div>
      <h3>Properties</h3>

      {section.type === "hero" && (
        <div>
          <label>
            Headline
            <input type="text" value={section.props.headline} onChange={(e) => updateProps({ headline: e.target.value })} />
          </label>
          <label>
            Subheadline
            <input
              type="text"
              value={section.props.subheadline ?? ""}
              onChange={(e) => updateProps({ subheadline: e.target.value })}
            />
          </label>
          <label>
            CTA text
            <input type="text" value={section.props.ctaText ?? ""} onChange={(e) => updateProps({ ctaText: e.target.value })} />
          </label>
          <label>
            CTA link
            <input type="text" value={section.props.ctaTarget ?? ""} onChange={(e) => updateProps({ ctaTarget: e.target.value })} />
          </label>
          <label>
            Image URL
            <input type="text" value={section.props.imageUrl ?? ""} onChange={(e) => updateProps({ imageUrl: e.target.value })} />
          </label>
          <AlignmentField value={section.props.alignment} onChange={(alignment) => updateProps({ alignment })} />
        </div>
      )}

      {section.type === "text" && (
        <div>
          <label>
            Heading
            <input type="text" value={section.props.heading ?? ""} onChange={(e) => updateProps({ heading: e.target.value })} />
          </label>
          <label>
            Body
            <textarea value={section.props.body} onChange={(e) => updateProps({ body: e.target.value })} />
          </label>
          <AlignmentField value={section.props.alignment} onChange={(alignment) => updateProps({ alignment })} />
        </div>
      )}

      {section.type === "image" && (
        <div>
          <label>
            Image URL
            <input type="text" value={section.props.url} onChange={(e) => updateProps({ url: e.target.value })} />
          </label>
          <label>
            Alt text
            <input type="text" value={section.props.altText} onChange={(e) => updateProps({ altText: e.target.value })} />
          </label>
          <label>
            Link URL
            <input type="text" value={section.props.linkUrl ?? ""} onChange={(e) => updateProps({ linkUrl: e.target.value })} />
          </label>
          <AlignmentField value={section.props.alignment} onChange={(alignment) => updateProps({ alignment })} />
        </div>
      )}

      {section.type === "product_showcase" && (
        <div>
          <label>
            Heading
            <input type="text" value={section.props.heading ?? ""} onChange={(e) => updateProps({ heading: e.target.value })} />
          </label>
          <label>
            Display style
            <select
              value={section.props.displayStyle}
              onChange={(e) => updateProps({ displayStyle: e.target.value })}
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </label>
          <fieldset>
            <legend>Products</legend>
            {products.length === 0 && <p>No synced products yet.</p>}
            {products.map((product) => {
              const checked = section.props.productIds.includes(product.id);
              return (
                <label key={product.id} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const productIds = e.target.checked
                        ? [...section.props.productIds, product.id]
                        : section.props.productIds.filter((id) => id !== product.id);
                      updateProps({ productIds });
                    }}
                  />{" "}
                  {product.title}
                </label>
              );
            })}
          </fieldset>
        </div>
      )}

      <fieldset>
        <legend>Layout</legend>
        <label>
          Padding
          <select value={section.settings.padding} onChange={(e) => updateSettings({ padding: e.target.value })}>
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label>
          Background color
          <input
            type="text"
            placeholder="#ffffff"
            value={section.settings.backgroundColor ?? ""}
            onChange={(e) => updateSettings({ backgroundColor: e.target.value || undefined })}
          />
        </label>
      </fieldset>
    </div>
  );
}
