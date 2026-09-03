import { z } from "zod";

export const HealthCheckResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
  database: z.literal("connected"),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
