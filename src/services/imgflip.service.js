import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { fetchWithTimeout } from "../utils/helpers.js";

const memeTemplateCache = {
  templates: null,
  fetchedAt: 0,
  inflight: null
};

export function isImgflipServiceFailure(error) {
  return (
    error instanceof AppError &&
    (error.code === "IMGFLIP_NOT_CONFIGURED" ||
      error.code === "UPSTREAM_UNAVAILABLE" ||
      error.code === "UPSTREAM_TIMEOUT")
  );
}

export async function fetchTopMemeTemplatesFromImgflip() {
  const response = await fetchWithTimeout(config.imgflipGetMemesUrl, { method: "GET" });
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
    .slice(0, config.templateCacheLimit)
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

export async function getTopMemeTemplates() {
  const now = Date.now();
  if (
    Array.isArray(memeTemplateCache.templates) &&
    memeTemplateCache.templates.length > 0 &&
    now - memeTemplateCache.fetchedAt < config.templateCacheTtlMs
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

export async function captionMeme(plan) {
  const username = process.env.IMGFLIP_USERNAME?.trim() || config.imgflipUsername;
  const password = process.env.IMGFLIP_PASSWORD?.trim() || config.imgflipPassword;

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
    response = await fetchWithTimeout(config.imgflipCaptionUrl, {
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

export async function captionClassicMeme(plan, skipIds = []) {
  const skip = new Set(skipIds.map(String).filter(Boolean));
  let lastError;
  for (const classic of config.classicTemplates) {
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
