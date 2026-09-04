import type { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    /** Exact bytes of the request body, captured before JSON parsing — required for webhook HMAC verification. */
    rawBody?: Buffer;
  }
}

export function captureRawBody(req: Request, _res: unknown, buf: Buffer): void {
  req.rawBody = buf;
}
