import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// This file exercises app.ts's production-only static/SPA-serving branch,
// which is gated on env.NODE_ENV === "production". vitest.setup.ts sets
// NODE_ENV to "test" for the suite as a whole; overriding it here (before
// the dynamic import below, which is what actually evaluates config/env.ts)
// affects only this isolated test file's module graph — restored in
// afterAll so it can't leak into other files sharing the same worker.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

vi.mock("./db/pool.js", () => ({
  pool: {
    query: vi.fn(async () => ({ rows: [{ "?column?": 1 }] })),
    end: vi.fn(),
  },
}));

const { createApp } = await import("./app.js");

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("production SPA serving", () => {
  it("serves the built SPA entry for GET /", async () => {
    const res = await request(createApp()).get("/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("<div id=\"root\">");
  });

  it("falls back to index.html for a frontend route not known to the server", async () => {
    const res = await request(createApp()).get("/preview/123");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("<div id=\"root\">");
  });

  it("falls back to index.html for a nested editor-style route", async () => {
    const res = await request(createApp()).get("/some-editor-route");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<div id=\"root\">");
  });

  it("still routes /api/* to the API router rather than the SPA", async () => {
    // No Authorization header -> the real requireShopAuth middleware should
    // reject it, proving the request reached the API router (not the SPA
    // fallback, which would have returned index.html with a 200).
    const res = await request(createApp()).get("/api/products");

    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("returns a JSON 404 (not the SPA) for an unknown /api/* path", async () => {
    const res = await request(createApp()).get("/api/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("still serves /health normally alongside SPA serving", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected" });
  });

  it("serves a real built static asset referenced by index.html", async () => {
    const indexRes = await request(createApp()).get("/");
    const assetPath = indexRes.text.match(/src="(\/assets\/[^"]+)"/)?.[1];
    expect(assetPath).toBeTruthy();

    const assetRes = await request(createApp()).get(assetPath as string);
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers["content-type"]).toMatch(/javascript/);
  });
});
