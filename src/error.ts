import type { ErrorRequestHandler, RequestHandler } from "express";
import { validationResult } from "express-validator";

/** Expected failure with a client-safe message and an HTTP status. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
/** Translate failures to HTTP responses without exposing unexpected internal errors. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.statusCode : 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? "Internal server error" : err.message,
  });
};
/** Stop the request before sending if any route validator rejected its content. */
export const handleValidationErrors: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};
