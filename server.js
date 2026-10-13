import "dotenv/config";

import express from "express";
import fetch from "node-fetch";
import { BackboardClient } from "backboard-sdk";
import { GoogleGenAI, Modality } from "@google/genai";

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_SITUATION_LENGTH = 700;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const IMGFLIP_GET_MEMES_URL = "https://api.imgflip.com/get_memes";
const TEMPLATE_CACHE_TTL_MS = 60 * 60 * 1000;
const TEMPLATE_CACHE_LIMIT = 100;

const memeTemplateCache = {
  templates: null,
  fetchedAt: 0,
  inflight: null
};

const CLASSIC_MEME_TEMPLATES = Object.freeze([
  { name: "Drake Hotline Bling", id: "181913649" },
  { name: "Monkey Puppet", id: "148914733" }
]);

class AppError extends Error {
  constructor(status, code, message, options = {}) {
    super(message, options);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.expose = options.expose ?? status < 500;
  }
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(503, "CONFIGURATION_ERROR", `${name} is not configured.`, {
      expose: true
    });
  }
  return value;
}

function stripCodeFence(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function extractJson(value) {
  const cleaned = stripCodeFence(value);

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Fall through to the consistent client-safe error below.
      }
    }
  }

  throw new AppError(502, "INVALID_AI_RESPONSE", "The AI returned an invalid meme plan.");
}

function hasImgflipCredentials() {
  return Boolean(process.env.IMGFLIP_USERNAME?.trim() && process.env.IMGFLIP_PASSWORD?.trim());
}

function isImgflipServiceFailure(error) {
  return (
    error instanceof AppError &&
    (error.code === "IMGFLIP_NOT_CONFIGURED" ||
      error.code === "UPSTREAM_UNAVAILABLE" ||
      error.code === "UPSTREAM_TIMEOUT")
  );
}

function defaultMemePlan(situation, trendingValid = false) {
  const classic = CLASSIC_MEME_TEMPLATES[0];
  return {
    templateName: classic.name,
    imgflipId: classic.id,
    topText: situation.slice(0, 220) || "When things happen",
    bottomText: "This is fine",
    trendingValid
  };
}

function validateMemePlan(plan, templates = []) {
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

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError(504, "UPSTREAM_TIMEOUT", "A meme service took too long to respond.");
    }
    throw new AppError(502, "UPSTREAM_UNAVAILABLE", "A meme service is currently unavailable.", {
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getTopMemeTemplates() {
  const now = Date.now();
  if (
    Array.isArray(memeTemplateCache.templates) &&
    memeTemplateCache.templates.length > 0 &&
    now - memeTemplateCache.fetchedAt < TEMPLATE_CACHE_TTL_MS
  ) {
    return memeTemplateCache.templates;
  }

  if (!memeTemplateCache.inflight) {
    memeTemplateCache.inflight = fetchTopMemeTemplatesFromImgflip().finally(() => {
      memeTemplateCache.inflight = null;
    });
  }

  try {
    return await memeTemplateCache.inflight;
  } catch (error) {
    if (Array.isArray(memeTemplateCache.templates) && memeTemplateCache.templates.length > 0) {
      console.warn("Using stale Imgflip template cache after refresh failure:", error.message);
      return memeTemplateCache.templates;
    }
    throw error;
  }
}

async function fetchTopMemeTemplatesFromImgflip() {
  const response = await fetchWithTimeout(IMGFLIP_GET_MEMES_URL, { method: "GET" });
  if (!response.ok) {
    throw new AppError(502, "IMGFLIP_REQUEST_FAILED", `Imgflip template list failed: HTTP ${response.status}`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new AppError(502, "IMGFLIP_INVALID_RESPONSE", "Imgflip returned an invalid template list.");
  }

  const memes = result?.success && Array.isArray(result?.data?.memes) ? result.data.memes : null;
  if (!memes || memes.length === 0) {
    throw new AppError(502, "IMGFLIP_REQUEST_FAILED", "Imgflip did not return any meme templates.");
  }

  const templates = memes
    .slice(0, TEMPLATE_CACHE_LIMIT)
    .map((meme) => ({
      id: meme.id == null ? "" : String(meme.id),
      name: typeof meme.name === "string" ? meme.name : "",
      url: meme.url,
      width: meme.width,
      height: meme.height,
      box_count: meme.box_count
    }))
    .filter((meme) => meme.id && meme.name);

  if (templates.length === 0) {
    throw new AppError(502, "IMGFLIP_REQUEST_FAILED", "Imgflip did not return any usable meme templates.");
  }

  memeTemplateCache.templates = templates;
  memeTemplateCache.fetchedAt = Date.now();
  return templates;
}

async function createMemePlan(situation) {
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
      timeout: REQUEST_TIMEOUT_MS
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

async function captionClassicMeme(plan, skipIds = []) {
  const skip = new Set(skipIds.map(String).filter(Boolean));
  let lastError;
  for (const classic of CLASSIC_MEME_TEMPLATES) {
    if (skip.has(String(classic.id))) {
      continue;
    }
    const classicPlan = {
      ...plan,
      templateName: classic.name,
      imgflipId: classic.id,
      trendingValid: false
    };
    try {
      const url = await captionMeme(classicPlan);
      return { url, plan: classicPlan };
    } catch (error) {
      lastError = error;
      console.warn(`Tier 2 classic template ${classic.name} failed:`, error.message);
      if (isImgflipServiceFailure(error)) {
        throw error;
      }
    }
  }
  throw lastError || new AppError(502, "IMGFLIP_REQUEST_FAILED", "Classic Imgflip templates could not generate that meme.");
}

async function generateMemePipeline(situation) {
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

async function captionMeme(plan) {
  const username = process.env.IMGFLIP_USERNAME?.trim();
  const password = process.env.IMGFLIP_PASSWORD?.trim();

  if (!username || !password) {
    throw new AppError(503, "IMGFLIP_NOT_CONFIGURED", "Imgflip credentials are not defined in environment variables.");
  }

  const form = new URLSearchParams({
    template_id: plan.imgflipId,
    username,
    password,
    text0: plan.topText,
    text1: plan.bottomText
  });

  let response;
  try {
    response = await fetchWithTimeout("https://api.imgflip.com/caption_image", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(502, "IMGFLIP_REQUEST_FAILED", "Failed to reach Imgflip API.", { cause: error });
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new AppError(502, "IMGFLIP_INVALID_RESPONSE", "Imgflip returned an invalid response.");
  }

  if (!response.ok || !result?.success || typeof result?.data?.url !== "string") {
    const errorMsg = result?.error_message || `HTTP ${response.status}`;
    console.error("Imgflip caption error:", errorMsg);
    throw new AppError(502, "IMGFLIP_REQUEST_FAILED", `Imgflip could not generate that meme: ${errorMsg}`);
  }

  return result.data.url;
}

async function generateGeminiMeme(situation, plan) {
  const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(503, "CONFIGURATION_ERROR", "GEMINI_API_KEY is not configured.", {
      expose: true
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Create a funny meme style image illustrating this situation: ${situation} with text overlay saying '${plan.topText} ... ${plan.bottomText}'`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE]
      }
    });
  } catch (error) {
    console.error("Gemini image generation error:", error);
    throw new AppError(502, "GEMINI_REQUEST_FAILED", "Gemini could not generate that meme.", {
      cause: error
    });
  }

  let base64Data = null;
  let mimeType = "image/png";

  const candidates = response?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        base64Data = part.inlineData.data;
        if (part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        break;
      }
    }
    if (base64Data) break;
  }

  if (!base64Data && response?.generatedImages?.[0]?.image?.imageBytes) {
    base64Data = response.generatedImages[0].image.imageBytes;
    mimeType = "image/png";
  }

  if (!base64Data) {
    throw new AppError(502, "INVALID_AI_RESPONSE", "Gemini did not return an image.");
  }

  return base64Data.startsWith("data:")
    ? base64Data
    : `data:${mimeType};base64,${base64Data}`;
}

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(express.static("public", { extensions: ["html"] }));

app.post("/api/generate", async (req, res, next) => {
  try {
    const situation = typeof req.body?.situation === "string" ? req.body.situation.trim() : "";
    if (!situation) {
      throw new AppError(400, "INVALID_SITUATION", "Please describe the situation first.");
    }
    if (situation.length > MAX_SITUATION_LENGTH) {
      throw new AppError(400, "SITUATION_TOO_LONG", `Keep the situation under ${MAX_SITUATION_LENGTH} characters.`);
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

app.use((req, res, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found."));
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }
    });
  }

  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof AppError && error.expose ? error.message : "Something went wrong. Please try again.";

  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ success: false, error: { code, message } });
});

const server = app.listen(port, () => {
  console.log(`SITU-MEME is running at http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; closing server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
