import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: {
    query: (...args: unknown[]) => queryMock(...args),
    end: vi.fn(),
  },
}));

const { createApp } = await import("../app.js");

describe("GET /health", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("returns 200 with a valid payload when the database is reachable", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected" });
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it("returns 503 when the database is not reachable", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(createApp()).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
