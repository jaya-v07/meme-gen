import express from "express";
import apiRoutes from "./routes/index.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(requestLogger);
app.use(express.static("public", { extensions: ["html"] }));

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
