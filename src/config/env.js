import "dotenv/config";
import { AppError } from "../utils/AppError.js";

export const config = {
  port: Number.parseInt(process.env.PORT, 10) || 3000,
  requestTimeoutMs: 25_000,
  maxSituationLength: 700,
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  nanoBananaModel: process.env.NANO_BANANA_MODEL || "gemini-3.1-flash-image",
  imgflipUsername: process.env.IMGFLIP_USERNAME?.trim() || "",
  imgflipPassword: process.env.IMGFLIP_PASSWORD?.trim() || "",
  backboardApiKey: process.env.BACKBOARD_API_KEY?.trim() || "",
  imgflipGetMemesUrl: "https://api.imgflip.com/get_memes",
  imgflipCaptionUrl: "https://api.imgflip.com/caption_image",
  templateCacheTtlMs: 60 * 60 * 1000,
  templateCacheLimit: 100,
  classicTemplates: Object.freeze([
    { name: "Drake Hotline Bling", id: "181913649" },
    { name: "Monkey Puppet", id: "148914733" }
  ])
};

export function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(503, "CONFIGURATION_ERROR", `${name} is not configured.`, {
      expose: true
    });
  }
  return value;
}

export function hasImgflipCredentials() {
  return Boolean(process.env.IMGFLIP_USERNAME?.trim() && process.env.IMGFLIP_PASSWORD?.trim());
}
