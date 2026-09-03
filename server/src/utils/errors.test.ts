import { describe, expect, it } from "vitest";
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "./errors.js";

describe("AppError family", () => {
  it("sets statusCode and code on the base AppError", () => {
    const err = new AppError("boom", 418, "TEAPOT");
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe("TEAPOT");
    expect(err.isOperational).toBe(true);
  });

  it.each([
    [NotFoundError, 404, "NOT_FOUND"],
    [ValidationError, 400, "VALIDATION_ERROR"],
    [UnauthorizedError, 401, "UNAUTHORIZED"],
    [ForbiddenError, 403, "FORBIDDEN"],
  ] as const)("%s maps to status %i and code %s", (ErrorClass, statusCode, code) => {
    const err = new ErrorClass();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(statusCode);
    expect(err.code).toBe(code);
  });
});
