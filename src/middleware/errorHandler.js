import { AppError } from "../utils/AppError.js";

export function notFoundHandler(req, res, next) {
  next(new AppError(404, "NOT_FOUND", "Route not found."));
}

export function errorHandler(error, _req, res, _next) {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }
    });
  }

  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const message =
    error instanceof AppError && error.expose
      ? error.message
      : "Something went wrong. Please try again.";

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({ success: false, error: { code, message } });
}
