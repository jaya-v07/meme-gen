import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitSituationIntoCaptions, createMemePlan } from "../src/services/meme.service.js";

describe("Meme Service Suite", () => {
  it("splits situation into top and bottom captions using delimiters", () => {
    const result = splitSituationIntoCaptions("When you test in prod, but everything works");
    assert.equal(result.topText, "When you test in prod");
    assert.equal(result.bottomText, "everything works");
  });

  it("handles single-phrase situation with fallback bottomText", () => {
    const result = splitSituationIntoCaptions("Awkward silence in the elevator");
    assert.equal(result.topText, "Awkward silence in the elevator");
    assert.equal(result.bottomText, "This is fine");
  });

  it("createMemePlan produces a valid meme plan object", async () => {
    const plan = await createMemePlan("Deploying on Friday");
    assert.ok(plan.templateName);
    assert.ok(plan.imgflipId);
    assert.ok(plan.topText);
    assert.ok(plan.bottomText);
    assert.equal(typeof plan.trendingValid, "boolean");
  });
});
