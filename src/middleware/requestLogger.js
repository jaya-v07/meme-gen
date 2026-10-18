export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    // Only log API requests and non-static assets to avoid cluttering logs
    if (req.originalUrl.startsWith("/api") || res.statusCode >= 400) {
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
}
