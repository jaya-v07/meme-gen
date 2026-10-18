import { AppError } from "../utils/AppError.js";

export async function generateGeminiMeme(situation, plan = {}) {
  const apiKey = process.env.POLLINATIONS_API_KEY;

  const topText = plan?.topText || "";
  const bottomText = plan?.bottomText || "";
  const textHint = topText || bottomText ? ` with text overlay saying '${topText} ... ${bottomText}'` : "";
  const prompt = `Create a funny meme style image illustrating this situation: ${situation}${textHint}`;

  const model = process.env.POLLINATIONS_MODEL || "black-forest-labs/flux.1-schnell";
  const encodedPrompt = encodeURIComponent(prompt);

  // Construct URL
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${encodeURIComponent(model)}`;

  // Set Authorization header if an API key is present
  const headers = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    console.error("Pollinations network error:", error.message);
    throw new AppError(502, "POLLINATIONS_REQUEST_FAILED", `Failed to connect to image generation service: ${error.message}`, {
      cause: error
    });
  }

  if (!response.ok) {
    console.error(`Pollinations error HTTP ${response.status}: ${response.statusText}`);
    throw new AppError(502, "POLLINATIONS_RESPONSE_ERROR", `Image generation service returned status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new AppError(502, "INVALID_AI_RESPONSE", "Pollinations returned an empty image payload.");
  }

  const base64Data = buffer.toString("base64");
  return `data:${mimeType};base64,${base64Data}`;
}