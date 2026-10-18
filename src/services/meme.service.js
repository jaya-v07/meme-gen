import { hasImgflipCredentials } from "../config/env.js";
import { createMemePlan } from "./backboard.service.js";
import {
  captionMeme,
  captionClassicMeme,
  isImgflipServiceFailure
} from "./imgflip.service.js";
import { generateGeminiMeme } from "./gemini.service.js";

export async function generateMemePipeline(situation) {
  const plan = await createMemePlan(situation);

  if (!hasImgflipCredentials()) {
    console.warn("Imgflip credentials missing; skipping Imgflip tiers and using Gemini.");
    const url = await generateGeminiMeme(situation, plan);
    return { url, source: "gemini", template: plan.templateName || "Gemini original" };
  }

  const triedTrendingIds = [];
  if (plan.trendingValid && plan.imgflipId) {
    try {
      const url = await captionMeme(plan);
      return { url, source: "imgflip-trending", template: plan.templateName };
    } catch (error) {
      console.warn("Tier 1 trending Imgflip caption failed:", error.message);
      triedTrendingIds.push(plan.imgflipId);
      if (isImgflipServiceFailure(error)) {
        const url = await generateGeminiMeme(situation, plan);
        return { url, source: "gemini", template: plan.templateName || "Gemini original" };
      }
    }
  }

  try {
    const classic = await captionClassicMeme(plan, triedTrendingIds);
    return { url: classic.url, source: "imgflip-classic", template: classic.plan.templateName };
  } catch (error) {
    console.warn("Tier 2 classic Imgflip failed; falling back to Gemini:", error.message);
  }

  const url = await generateGeminiMeme(situation, plan);
  return { url, source: "gemini", template: plan.templateName || "Gemini original" };
}
