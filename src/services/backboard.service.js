import { BackboardClient } from "backboard-sdk";
import { config, getRequiredEnv } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { extractJson } from "../utils/helpers.js";
import { getTopMemeTemplates } from "./imgflip.service.js";

export function defaultMemePlan(situation, trendingValid = false) {
  const classic = config.classicTemplates[0];
  return {
    templateName: classic.name,
    imgflipId: classic.id,
    topText: situation.slice(0, 220) || "When things happen",
    bottomText: "This is fine",
    trendingValid
  };
}

export function validateMemePlan(plan, templates = []) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new AppError(502, "INVALID_AI_RESPONSE", "The AI returned an invalid meme plan.");
  }

  const templateName = typeof plan.templateName === "string" ? plan.templateName.trim() : "";
  const imgflipId = plan.imgflipId == null ? "" : String(plan.imgflipId).trim();
  const topText = typeof plan.topText === "string" ? plan.topText.trim() : "";
  const bottomText = typeof plan.bottomText === "string" ? plan.bottomText.trim() : "";
  const hasCatalog = Array.isArray(templates) && templates.length > 0;
  const matched = hasCatalog ? templates.find((item) => String(item.id) === imgflipId) : null;

  if (matched) {
    return {
      templateName: matched.name || templateName,
      imgflipId: String(matched.id),
      topText: topText || "When things happen",
      bottomText: bottomText || "Bottom text",
      trendingValid: true
    };
  }

  // No catalog (web-search-only pick) still counts as Tier 1 if we have an ID to caption.
  if (imgflipId && !hasCatalog) {
    return {
      templateName: templateName || "Trending meme",
      imgflipId,
      topText: topText || "When things happen",
      bottomText: bottomText || "Bottom text",
      trendingValid: true
    };
  }

  return {
    templateName,
    imgflipId,
    topText: topText || "When things happen",
    bottomText: bottomText || "Bottom text",
    trendingValid: false
  };
}

export async function createMemePlan(situation) {
  let templates = [];
  try {
    templates = await getTopMemeTemplates();
  } catch (error) {
    console.warn("Could not load trending Imgflip templates; using web search only:", error.message);
  }

  const templateListSummary = templates.length
    ? templates.map((template) => `${template.name} [${template.id}]`).join(", ")
    : "(catalog unavailable — use web search to identify a current viral Imgflip template ID)";

  let client;
  try {
    client = new BackboardClient({
      apiKey: getRequiredEnv("BACKBOARD_API_KEY"),
      timeout: config.requestTimeoutMs
    });
  } catch (error) {
    console.warn("Backboard unavailable; using classic captions for later tiers:", error.message);
    return defaultMemePlan(situation);
  }
  const prompt = `You are a meme curator with awareness of current internet culture and viral formats. Use web search when it helps identify which currently trending format best matches the nuance of this situation.

Analyze this situation: "${situation}". Choose the single best-fitting meme template from this list of top trending Imgflip templates: ${templateListSummary}.

Prefer a specific viral format that matches the situation over a generic default. Do not always pick the first item or Drake Hotline Bling unless it is genuinely the best fit.

Return JSON with: { "templateName": "...", "imgflipId": "...", "topText": "...", "bottomText": "..." }`;

  let response;
  try {
    response = await client.sendMessage({
      content: prompt,
      stream: false,
      memory: "off",
      json_output: true,
      web_search: "auto"
    });
  } catch (error) {
    console.warn("Backboard meme plan failed; using classic captions for later tiers:", error.message);
    return defaultMemePlan(situation);
  }

  if (typeof response?.content !== "string") {
    console.warn("Backboard returned an empty meme plan; using classic captions for later tiers.");
    return defaultMemePlan(situation);
  }

  try {
    return validateMemePlan(extractJson(response.content), templates);
  } catch (error) {
    console.warn("Could not parse Backboard meme plan; using classic captions for later tiers:", error.message);
    return defaultMemePlan(situation);
  }
}
