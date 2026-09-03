import { describe, expect, it } from "vitest";
import { HealthCheckResponseSchema } from "./health.schema.js";

describe("HealthCheckResponseSchema", () => {
  it("accepts a valid health response", () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: "ok",
      service: "server",
      timestamp: new Date().toISOString(),
      database: "connected",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a response with the wrong status literal", () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: "degraded",
      service: "server",
      timestamp: new Date().toISOString(),
      database: "connected",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a response missing required fields", () => {
    const result = HealthCheckResponseSchema.safeParse({ status: "ok" });

    expect(result.success).toBe(false);
  });
});
