import { config, hasImgflipCredentials } from "../config/env.js";
import {
  captionMeme,
  captionClassicMeme,
  getTopMemeTemplates,
  isImgflipServiceFailure
} from "./imgflip.service.js";
import { generateGeminiMeme } from "./gemini.service.js";

export function splitSituationIntoCaptions(situation) {
  const trimmed = situation.trim();
  const parts = trimmed
    .split(/(?:[.,;!?]|\s+when\s+|\s+but\s+|\s+and\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      topText: parts[0].slice(0, 100),
      bottomText: parts.slice(1).join(" ").slice(0, 100)
    };
  }

  return {
    topText: trimmed.slice(0, 100) || "When things happen",
    bottomText: "This is fine"
  };
}

export async function createMemePlan(situation) {
  const { topText, bottomText } = splitSituationIntoCaptions(situation);
  let template = null;
  let trendingValid = false;

  try {
    const templates = await getTopMemeTemplates();
    const situationLower = situation.toLowerCase();
    const matched = templates.find((t) => {
      const words = t.name.toLowerCase().split(/[\s_-]+/).filter((w) => w.length > 3);
      return words.some((word) => situationLower.includes(word));
    });

    if (matched) {
      template = matched;
      trendingValid = true;
    }
  } catch (err) {
    console.warn("Could not retrieve trending templates for matching:", err.message);
  }

  const classic = config.classicTemplates[0];
  return {
    templateName: template ? template.name : classic.name,
    imgflipId: template ? template.id : classic.id,
    topText,
    bottomText,
    trendingValid
  };
}

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
