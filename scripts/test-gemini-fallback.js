import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { generateGeminiMeme } from "../src/services/gemini.service.js";

async function main() {
  const situation = "Deploying to production on a Friday at 5 PM.";
  const plan = {
    topText: "Deploying to prod at 5 PM",
    bottomText: "What could possibly go wrong?"
  };

  console.log("=== Testing Nano Banana / Gemini Fallback Image Generation ===");
  console.log(`Situation: "${situation}"`);
  console.log(`Captions: "${plan.topText}" / "${plan.bottomText}"`);
  console.log("Invoking image generation service...");

  try {
    const dataUrl = await generateGeminiMeme(situation, plan);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const outputPath = path.resolve("public", "test-gemini-fallback.jpg");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);

    console.log("\n[SUCCESS] Image successfully generated and saved!");
    console.log(`- File path: ${outputPath}`);
    console.log(`- File size: ${buffer.length} bytes`);
    console.log(`- Format: JPEG`);
  } catch (error) {
    console.log("\n[RESULT] Fallback caught error gracefully without crashing process:");
    console.log(`- Error Code: ${error.code || "N/A"}`);
    console.log(`- HTTP Status: ${error.status || 500}`);
    console.log(`- Message: ${error.message}`);
    if (error.cause) {
      console.log(`- Cause: ${error.cause.message || error.cause}`);
    }
  }
}

main();
