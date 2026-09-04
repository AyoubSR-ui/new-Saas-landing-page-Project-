import type { LandingPageListResponse } from "@ecommerce-landing-saas/shared";
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
