import type { PageSection, SectionType } from "@ecommerce-landing-saas/shared";

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  text: "Text",
  image: "Image",
  product_showcase: "Products",
};

const ADDABLE_TYPES: SectionType[] = ["hero", "text", "image", "product_showcase"];

interface SectionListProps {
  sections: PageSection[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: SectionType) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}

export function SectionList({ sections, selectedSectionId, onSelect, onAdd, onRemove, onMove }: SectionListProps): JSX.Element {
  return (
    <div>
      <h3>Sections</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {sections.map((section, index) => (
          <li
            key={section.id}
            style={{
              padding: "0.5rem",
              marginBottom: "0.25rem",
              border: "1px solid #ddd",
              background: section.id === selectedSectionId ? "#eef2ff" : undefined,
            }}
          >
            <button type="button" onClick={() => onSelect(section.id)} style={{ fontWeight: section.id === selectedSectionId ? "bold" : "normal" }}>
              {SECTION_TYPE_LABELS[section.type]}
            </button>{" "}
            <button type="button" onClick={() => onMove(section.id, "up")} disabled={index === 0} aria-label="Move up">
              ↑
            </button>{" "}
            <button type="button" onClick={() => onMove(section.id, "down")} disabled={index === sections.length - 1} aria-label="Move down">
              ↓
            </button>{" "}
            <button type="button" onClick={() => onRemove(section.id)} aria-label="Delete section">
              Delete
            </button>
          </li>
        ))}
      </ul>
      {sections.length === 0 && <p>No sections yet — add one below.</p>}

      <h4>Add section</h4>
      {ADDABLE_TYPES.map((type) => (
        <button key={type} type="button" onClick={() => onAdd(type)}>
          + {SECTION_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
