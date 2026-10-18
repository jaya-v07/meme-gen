import "dotenv/config";
import app from "./src/app.js";
import { config } from "./src/config/env.js";

export default app;

// Vercel runs this app as a serverless function and manages the listener, so
// only bind a port when running locally.
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    console.log(`SITU-MEME is running at http://localhost:${config.port}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received; closing server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
