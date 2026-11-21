import { GoogleGenAI, Modality } from "@google/genai";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export function extractImageFromGeminiResponse(response) {
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
    if (response.generatedImages[0].image.mimeType) {
      mimeType = response.generatedImages[0].image.mimeType;
    }
  }

  if (!base64Data) {
    throw new AppError(502, "INVALID_AI_RESPONSE", "Gemini did not return an image.");
  }

  return base64Data.startsWith("data:")
    ? base64Data
    : `data:${mimeType};base64,${base64Data}`;
}

export async function generateGeminiMeme(situation, plan = {}, clientOverride = null) {
  const apiKey = (process.env.GEMINI_API_KEY !== undefined ? process.env.GEMINI_API_KEY : config.geminiApiKey)?.trim();
  if (!apiKey && !clientOverride) {
    throw new AppError(503, "CONFIGURATION_ERROR", "GEMINI_API_KEY is not configured.", {
      expose: true
    });
  }

  const topText = plan?.topText || "";
  const bottomText = plan?.bottomText || "";
  const textHint = topText || bottomText ? ` with text overlay saying '${topText} ... ${bottomText}'` : "";
  const prompt = `Create a funny meme style image illustrating this situation: ${situation}${textHint}`;

  const model = NANO_BANANA_MODEL?.trim() || config.geminiModel || "gemini-2.5-flash";
  const ai = clientOverride || new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE]
      }
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Gemini image generation error:", error.message || error);
    throw new AppError(502, "GEMINI_REQUEST_FAILED", `Gemini could not generate that meme: ${error.message || error}`, {
      cause: error
    });
  }

  return extractImageFromGeminiResponse(response);
}
