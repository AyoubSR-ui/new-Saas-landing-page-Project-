import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./errorHandler.js";
import { NotFoundError } from "../utils/errors.js";

function makeRes(): Response & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  });
  return res as Response & { statusCode?: number; body?: unknown };
}

const req = { requestId: "req-1" } as Request;

describe("errorHandler", () => {
  it("uses the AppError's own status/code", () => {
    const res = makeRes();
    errorHandler(new NotFoundError("gone"), req, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND", message: "gone" } });
  });

  it("maps a body-parser malformed-JSON error to 400, not 500", () => {
    const res = makeRes();
    const malformed = Object.assign(new SyntaxError("Unexpected token"), {
      type: "entity.parse.failed",
      status: 400,
    });

    errorHandler(malformed, req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "MALFORMED_BODY" } });
  });

  it("falls back to a generic 500 for an unrecognized error", () => {
    const res = makeRes();
    errorHandler(new Error("boom"), req, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
