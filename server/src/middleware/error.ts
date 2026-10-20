import type { Request, Response, NextFunction } from "express";
import { isProd } from "../config/env.js";

/** Operational error with an HTTP status; message is safe to show users. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: "Not found." });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }
  const name = (err as { name?: string } | undefined)?.name;
  if (name === "CastError" || name === "BSONError") {
    res.status(400).json({ success: false, message: "Invalid id." });
    return;
  }
  if (name === "ValidationError") {
    res.status(422).json({ success: false, message: "Invalid input." });
    return;
  }
  if ((err as { code?: string } | undefined)?.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ success: false, message: "Upload a JPEG, PNG or WebP image up to 5 MB." });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({
    success: false,
    message: isProd ? "Something went wrong. Please try again." : String((err as Error)?.message ?? err),
  });
}

/** Wrap async route handlers so rejections reach the error handler. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}
