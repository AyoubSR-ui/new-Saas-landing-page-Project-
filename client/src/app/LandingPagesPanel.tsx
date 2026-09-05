import { useCallback, useEffect, useState } from "react";
import type { LandingPageSummary } from "@ecommerce-landing-saas/shared";
import { createLandingPage, deleteLandingPage, fetchLandingPages, LandingPagesApiError } from "../lib/landingPagesApi";

type State =
  | { phase: "loading" }
  | { phase: "loaded"; items: LandingPageSummary[] }
  | { phase: "error"; message: string };

interface LandingPagesPanelProps {
  onEdit: (id: string) => void;
  onPreview: (id: string) => void;
}

// List/create/delete foundation from Phase 3, extended in Phase 4 with an
// "Edit" action (section editor) and in Phase 5 with a "Preview" action
// (standalone canonical-renderer view, see ../PagePreviewView.tsx).
export function LandingPagesPanel({ onEdit, onPreview }: LandingPagesPanelProps): JSX.Element {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const data = await fetchLandingPages();
      setState({ phase: "loaded", items: data.items });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof LandingPagesApiError ? err.message : "Could not load landing pages.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    if (title.trim().length === 0) return;
    setCreating(true);
    try {
      await createLandingPage(title.trim());
      setTitle("");
      await load();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof LandingPagesApiError ? err.message : "Could not create landing page.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteLandingPage(id);
      await load();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof LandingPagesApiError ? err.message : "Could not delete landing page.",
      });
    }
  }

  return (
    <section>
      <h2>Landing Pages</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New landing page title"
          disabled={creating}
        />
        <button type="submit" disabled={creating || title.trim().length === 0}>
          {creating ? "Creating…" : "Create draft"}
        </button>
      </form>

      {state.phase === "loading" && <p>Loading landing pages…</p>}
      {state.phase === "error" && <p role="alert">{state.message}</p>}
      {state.phase === "loaded" && state.items.length === 0 && <p>No landing pages yet — create your first draft above.</p>}
      {state.phase === "loaded" && state.items.length > 0 && (
        <ul>
          {state.items.map((page) => (
            <li key={page.id}>
              <strong>{page.title}</strong> <span>({page.status.toLowerCase()})</span>{" "}
              <span>· {page.productCount} product{page.productCount === 1 ? "" : "s"}</span>{" "}
              <button type="button" onClick={() => onEdit(page.id)}>
                Edit
              </button>{" "}
              <button type="button" onClick={() => onPreview(page.id)}>
                Preview
              </button>{" "}
              <button type="button" onClick={() => void handleDelete(page.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
