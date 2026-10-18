import fetch from "node-fetch";
import { AppError } from "./AppError.js";
import { config } from "../config/env.js";

export function stripCodeFence(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function extractJson(value) {
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

export async function fetchWithTimeout(url, options, timeoutMs = config.requestTimeoutMs) {
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
