import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/utils/AppError.js";
import { config } from "../src/config/env.js";
import {
  extractImageFromGeminiResponse,
  generateGeminiMeme
} from "../src/services/gemini.service.js";

describe("Gemini Service Suite", () => {
  it("extracts base64 image from candidate inlineData", () => {
    const fakeResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Here is your meme" },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: "dGVzdC1qcGVnLWRhdGE="
                }
              }
            ]
          }
        }
      ]
    };

    const dataUrl = extractImageFromGeminiResponse(fakeResponse);
    assert.equal(dataUrl, "data:image/jpeg;base64,dGVzdC1qcGVnLWRhdGE=");
  });

  it("extracts base64 image from generatedImages fallback", () => {
    const fakeResponse = {
      candidates: [],
      generatedImages: [
        {
          image: {
            imageBytes: "ZmFrZS1pbWFnZS1ieXRlcw==",
            mimeType: "image/png"
          }
        }
      ]
    };

    const dataUrl = extractImageFromGeminiResponse(fakeResponse);
    assert.equal(dataUrl, "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==");
  });

  it("throws INVALID_AI_RESPONSE when response contains no image parts", () => {
    const emptyResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "No image generated here" }]
          }
        }
      ]
    };

    assert.throws(
      () => extractImageFromGeminiResponse(emptyResponse),
      (err) => {
        return err instanceof AppError && err.code === "INVALID_AI_RESPONSE" && err.status === 502;
      }
    );
  });

  it("throws CONFIGURATION_ERROR when GEMINI_API_KEY is not configured", async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    const originalConfigKey = config.geminiApiKey;
    try {
      process.env.GEMINI_API_KEY = "";
      config.geminiApiKey = "";
      await assert.rejects(
        () => generateGeminiMeme("Deploying on Friday", {}),
        (err) => {
          return err instanceof AppError && err.code === "CONFIGURATION_ERROR" && err.status === 503;
        }
      );
    } finally {
      process.env.GEMINI_API_KEY = originalKey;
      config.geminiApiKey = originalConfigKey;
    }
  });

  it("generateGeminiMeme generates and returns data URL using clientOverride", async () => {
    const mockClient = {
      models: {
        generateContent: async ({ model, contents, config }) => {
          assert.ok(model);
          assert.ok(contents.includes("Deploying on Friday"));
          assert.ok(config.responseModalities);
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: "bW9ja2VkLWdlbWluaS1pbWFnZQ=="
                      }
                    }
                  ]
                }
              }
            ]
          };
        }
      }
    };

    const result = await generateGeminiMeme(
      "Deploying on Friday",
      { topText: "Deploying", bottomText: "On Friday" },
      mockClient
    );

    assert.equal(result, "data:image/png;base64,bW9ja2VkLWdlbWluaS1pbWFnZQ==");
  });

  it("generateGeminiMeme wraps API failure in GEMINI_REQUEST_FAILED AppError", async () => {
    const failingClient = {
      models: {
        generateContent: async () => {
          throw new Error("Quota exceeded or rate limit");
        }
      }
    };

    await assert.rejects(
      () => generateGeminiMeme("Deploying on Friday", {}, failingClient),
      (err) => {
        return (
          err instanceof AppError &&
          err.code === "GEMINI_REQUEST_FAILED" &&
          err.status === 502 &&
          err.message.includes("Quota exceeded")
        );
      }
    );
  });
});
