import { Router } from "express";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { generateMemePipeline } from "../services/meme.service.js";

const router = Router();

router.post("/generate", async (req, res, next) => {
  try {
    const situation = typeof req.body?.situation === "string" ? req.body.situation.trim() : "";
    if (!situation) {
      throw new AppError(400, "INVALID_SITUATION", "Please describe the situation first.");
    }
    if (situation.length > config.maxSituationLength) {
      throw new AppError(
        400,
        "SITUATION_TOO_LONG",
        `Keep the situation under ${config.maxSituationLength} characters.`
      );
    }

    const { url, source, template } = await generateMemePipeline(situation);

    res.json({
      success: true,
      url,
      source,
      template
    });
  } catch (error) {
    next(error);
  }
});

export default router;
