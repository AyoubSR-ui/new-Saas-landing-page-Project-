import type { LandingPageDetailResponse, LandingPageListResponse, PageDocument } from "@ecommerce-landing-saas/shared";
import { fetchWithSessionToken } from "./api";

export class LandingPagesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LandingPagesApiError";
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new LandingPagesApiError(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchLandingPages(): Promise<LandingPageListResponse> {
  const res = await fetchWithSessionToken("/api/landing-pages");
  return parseOrThrow<LandingPageListResponse>(res);
}

export async function createLandingPage(title: string): Promise<void> {
  const res = await fetchWithSessionToken("/api/landing-pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await parseOrThrow<unknown>(res);
}

export async function deleteLandingPage(id: string): Promise<void> {
  const res = await fetchWithSessionToken(`/api/landing-pages/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new LandingPagesApiError(body?.error?.message ?? `Request failed (${res.status})`);
  }
}

export async function fetchLandingPage(id: string): Promise<LandingPageDetailResponse> {
  const res = await fetchWithSessionToken(`/api/landing-pages/${id}`);
  return parseOrThrow<LandingPageDetailResponse>(res);
}

/** Saves the editor's current document via the existing PATCH endpoint — no second persistence API. */
export async function saveLandingPageDocument(id: string, document: PageDocument): Promise<LandingPageDetailResponse> {
  const res = await fetchWithSessionToken(`/api/landing-pages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: document }),
  });
  return parseOrThrow<LandingPageDetailResponse>(res);
}
