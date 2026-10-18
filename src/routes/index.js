import { Router } from "express";
import healthRouter from "./health.routes.js";
import memeRouter from "./meme.routes.js";

const router = Router();

router.use(healthRouter);
router.use(memeRouter);

export default router;
