# Engineering Upgrade: SITU-MEME — Retrieval-First AI Meme Generator

Act as a senior full-stack engineer, ML engineer, and software architect. Upgrade the existing SITU-MEME Generator into a reliable, intelligent, retrieval-first meme-generation platform.

**Repository:** https://github.com/jaya-v07/meme-gen

Do not merely suggest improvements or produce a new architecture document. Inspect the existing repository, implement the improvements, run the available tests, fix regressions, and update the documentation.

## 1. Understand the existing implementation first

The current application uses:

- Node.js with ES modules and Express 5.
- `server.js` as the primary backend.
- `public/index.html` as a vanilla HTML/CSS/JavaScript frontend.
- Backboard AI for choosing meme templates and generating captions.
- Imgflip for obtaining templates and rendering captioned memes.
- Google Gemini through `@google/genai` as an original-image generation fallback.
- An in-memory template cache with a one-hour TTL.
- `POST /api/generate` as the main generation endpoint.

The current pipeline is approximately:

1. Receive a situation from the user.
2. Fetch or reuse a cached catalog of popular Imgflip templates.
3. Ask an LLM to select a template and generate two captions.
4. Attempt to caption the selected template through Imgflip.
5. Fall back to classic templates.
6. Fall back to Gemini image generation.

Preserve these existing capabilities while correcting the architectural limitations described below.

Before editing, inspect all relevant files, dependencies, environment variables, frontend behavior, API responses, and deployment assumptions. Identify which components should be retained, refactored, or replaced.

Do not rewrite the entire application in a different framework merely for architectural neatness.

## 2. Primary objective: Build a retrieval-first intelligence engine

The application should not call an expensive image-generation model for every meme request.

It should first find the best existing visual for the user's situation, generate an appropriate caption, and render the result. Original image generation should be used when the available template library cannot satisfy the request.

Implement this decision flow:

**User prompt → prompt understanding → candidate retrieval → candidate ranking → caption generation → rendering → asset storage**

When retrieval fails to find a sufficiently good candidate:

**Low-confidence retrieval → optional original-image generation → caption verification/rendering → asset storage**

Keep the retrieval and generation paths independent so either can be improved without rewriting the other.

### A. Prompt understanding

Normalize the user's input and optionally extract structured information such as:

- Main topic and entities.
- Situation or underlying joke.
- Emotional tone: frustration, embarrassment, happiness, sarcasm, disbelief, and others.
- Humor style: relatable, ironic, absurdist, dark, wholesome, reaction-based, and others.
- Relevant context, including programming, college, work, relationships, gaming, and daily life.
- Preferred language.
- Suitable meme layout and number of caption regions.

Use a typed, validated representation internally.

Do not make an LLM call mandatory for basic input normalization. Use a lightweight deterministic path where possible, and call the language model when it materially improves understanding or caption quality.

Never trust unvalidated model-generated template IDs.

### B. Build a persistent meme-template catalog

Replace the assumption that the application only needs the first 100 currently popular Imgflip templates with a persistent, searchable catalog.

Use PostgreSQL with `pgvector` for metadata and embeddings.

Use object storage for image files in production. Provide a simple local development storage option so developers can run the application without requiring a paid storage account.

Each template record should support:

- Unique template ID.
- Name and description.
- Image storage key and thumbnail URL.
- Source and usage-license information.
- Semantic tags, categories, emotions, and humor styles.
- Template format and dimensions.
- Caption regions and text-position constraints.
- Image hash and perceptual hash for duplicate detection.
- Embedding model identifier and embedding version.
- Active status and ingestion timestamp.
- Optional selection, usage, and feedback statistics.

Implement database migrations and a reproducible template-ingestion command.

The ingestion process should validate image files, normalize supported formats, generate descriptions and searchable metadata, detect duplicates, and generate embeddings.

Respect source-site terms, copyright, and usage licenses. Do not bulk-download arbitrary third-party images without permission. Record provenance for each template.

### C. Implement real semantic image retrieval

Do not treat ordinary text tokenization as image understanding.

Use an image-text embedding model, such as a compatible CLIP- or SigLIP-family model, that places images and text in a shared embedding space.

Verify the selected model's current interface, dimensions, runtime requirements, and licensing before implementation.

Implement an embedding-provider abstraction so the embedding model can be replaced later.

For every indexed template, store its vector alongside the image and metadata. For a user request, encode the prompt into the same compatible space and retrieve semantically similar templates.

Important requirements:

- Do not compare vectors generated by incompatible models.
- Track model identity and dimensions.
- Do not invent or randomly initialize embeddings as a substitute for inference.
- Do not load a large inference model into every web request.
- Provide a documented ingestion process and sensible local development workflow.
- If the embedding provider is unavailable, degrade gracefully to keyword and metadata search instead of failing the entire application.

If a separate inference service is necessary, isolate it behind an interface and document how to run it.

### D. Implement hybrid retrieval and ranking

Vector similarity alone is not enough to select a funny meme.

Run complementary searches where appropriate:

1. Semantic vector similarity.
2. PostgreSQL full-text search.
3. Exact template names, tags, and category matches.
4. Compatibility with the detected emotion, humor style, and caption layout.
5. Historical feedback or selection statistics, when sufficient data exists.

Combine and rank the candidates using a transparent ranking strategy. Avoid arbitrary or unexplained ranking weights.

Start with a straightforward score combining semantic similarity, text relevance, metadata relevance, layout suitability, and optional quality feedback. Make its configuration explicit and testable.

Return a limited set of candidates, deduplicate them, and perform a final reranking pass when necessary.

All selected template IDs must correspond to validated records in the catalog.

### E. Add a confidence-based decision engine

The system must determine whether a retrieved template is suitable before choosing a generation strategy.

Use a configurable retrieval threshold that can be calibrated against a labeled evaluation dataset. Consider the best candidate's score and the separation between the top candidates rather than assuming every nearest-neighbor result is a good match.

Support these outcomes:

- Strong match: generate captions for the selected template.
- Multiple good matches: select the best option or return several choices to the frontend.
- Weak match: use the original-image generation fallback if enabled.
- Embedding-provider failure: attempt keyword-based retrieval.
- Image-generation failure: fall back to a suitable existing template if possible, otherwise return a clear error.

Do not ask an LLM to produce an uncalibrated confidence number and treat it as ground truth.

## 3. Separate caption generation from image generation

Create an independent caption-generation module.

It should receive the user situation, the selected template's semantics, its caption regions, and any relevant text-length restrictions.

It should produce validated structured output, such as:

{
  "topText": "FIXED ONE BUG",
  "bottomText": "INTRODUCED THREE NEW ONES"
}

This is an illustrative response format, not a fixed caption.

The caption generator must:

- Generate contextually relevant, concise, natural captions.
- Avoid blindly splitting the original user prompt into top and bottom text.
- Respect language and humor preferences.
- Account for templates with different numbers of text regions.
- Enforce configurable text-length limits.
- Handle malformed model responses safely.
- Provide a reasonable fallback where model access is unavailable.

Do not require image-generation models to render the final caption text.

## 4. Implement deterministic meme rendering

For retrieved templates, render captions using a dedicated image-rendering module instead of depending exclusively on Imgflip's caption API.

Use a suitable library such as Sharp with SVG-based text overlays, or another reliable image-rendering solution compatible with the deployment environment.

Support:

- High-contrast meme typography.
- Automatic text wrapping and font-size adjustment.
- Text outlines or shadows where appropriate.
- Template-specific caption positions.
- Images with different aspect ratios.
- Multiple caption regions.
- Correct image dimensions and PNG/JPEG output.
- A consistent rendering result across requests.

Allow custom captions to be edited before export. Never allow caption data to introduce arbitrary SVG markup or script execution.

Keep Imgflip integration as an optional source/provider where useful; do not make its credentials a prerequisite for rendering locally stored templates.

## 5. Improve original-image generation

Keep the Google image-generation integration, but isolate it behind a provider interface. Use a separate provider configuration for image generation and verify the currently supported model ID and response format against official Google documentation.

Do not assume a model name that no longer supports image generation.

The original-image path must:

1. Receive the understood user situation and intended visual concept.
2. Generate a suitable background visual.
3. Validate and normalize the returned image.
4. Render the final caption using the same renderer used by the template path.
5. Persist the output and return the same response schema as other providers.

Avoid asking the image model to render long, exact meme text directly into the artwork.

Make the image-generation feature optional and configurable. If it is unavailable, template-based meme creation must continue to work.

## 6. Add consistent asset storage and generation records

Do not return large base64 data URLs as the normal production response.

Implement a storage abstraction with local development support and an S3-compatible production option, such as Cloudflare R2.

Persist enough metadata to reproduce, audit, or retrieve a generated meme later.

At minimum, introduce suitable tables for:

- `meme_templates`
- `meme_embeddings`
- `generated_memes`
- `meme_feedback`
- `generation_jobs`, if asynchronous generation is implemented

Use migrations and parameterized database queries.

Preserve provider, model, selected template, original prompt, caption data, creation timestamp, and output-storage key where appropriate.

Do not save user prompts or generated assets indefinitely without a defined retention policy.

## 7. Improve API design without breaking the current frontend

Retain `POST /api/generate` and keep the existing request format compatible:

{
  "situation": "I fixed one production bug and created three more."
}

The existing response fields `success`, `url`, `source`, and `template` should remain available.

You may add fields such as:

- `memeId`
- `generationMode`
- `captions`
- `alternatives`
- `jobId`, where applicable
- `status`, where applicable

Add endpoints as needed for:

- Searching template candidates.
- Retrieving a generated meme by ID.
- Recording feedback.
- Checking the status of long-running image-generation jobs.

Template retrieval and caption rendering should remain fast and synchronous where practical. Use a background queue and a job-status endpoint for generation operations that risk exceeding request timeouts.

Do not introduce Redis or another infrastructure dependency unless it provides a clear benefit. Keep job execution, caching, and storage behind interfaces so the application remains maintainable.

## 8. Upgrade the frontend

Improve the existing `public/index.html` rather than forcing an unnecessary framework migration.

Keep the dark visual identity, but improve the user experience with:

- A clear prompt input and character count.
- Loading, success, empty, and error states.
- A meme preview with sensible sizing.
- A distinction between template-based and original-image generation.
- Caption editing and regeneration.
- An option to try another retrieved template.
- A deliberate option to request an original visual, when enabled.
- A working PNG download action.
- A way to submit positive or negative feedback.
- Responsive mobile layouts and accessible controls.

Make the generation flow transparent without exposing secrets, raw model reasoning, or internal infrastructure details.

Never show a successful result before the output is actually available.

## 9. Security, reliability, and cost controls

Implement appropriate production safeguards:

- Validate the request body and user input.
- Preserve the existing input-length limit or document a justified change.
- Add configurable rate limiting.
- Keep API credentials server-side.
- Validate all model-generated output.
- Set timeouts and cancellation behavior for external requests.
- Use bounded retries and exponential backoff where appropriate.
- Prevent malformed image data and unsafe file paths.
- Limit file size, image dimensions, and supported image formats.
- Avoid excessive logging of potentially sensitive user prompts.
- Track provider failures, latency, and estimated usage costs.
- Ensure one provider's failure does not unnecessarily disable other providers.
- Make cache invalidation and stale-data fallback predictable.

Never allow a missing Imgflip credential to force Gemini image generation if a valid local meme template can still be retrieved and rendered.

## 10. Testing and evaluation

Add an automated test suite and make it runnable through `npm test`.

Cover:

- Input validation and malformed JSON.
- Template-catalog parsing and ingestion.
- Embedding dimensions and provider failures.
- Vector and keyword retrieval.
- Ranking and confidence-threshold decisions.
- Candidate-ID validation.
- Caption formatting and rendering.
- Storage failures and image-provider timeouts.
- Fallback behavior at each stage.
- API response backward compatibility.
- Rate limits and error responses.

Mock external services in unit tests. Do not require paid API calls just to run the core test suite.

Create a small, labeled evaluation dataset of realistic prompts and suitable templates. Measure retrieval quality, including top-K accuracy and fallback frequency, and document how to add evaluation examples.

Use deterministic ranking and rendering tests wherever possible.

## 11. Code organization

Keep the current Express and vanilla frontend stack unless a specific technical limitation justifies changing it.

Refactor `server.js` into focused modules. A possible structure is:

src/
  config/
  routes/
  services/
    prompt-understanding/
    meme-retrieval/
    caption-generation/
    image-generation/
    image-rendering/
    asset-storage/
  providers/
  repositories/
  jobs/
  middleware/
  utils/

scripts/
  ingest-templates.js
  evaluate-retrieval.js

migrations/
tests/

public/
  index.html
  assets/

Adapt this structure to the existing repository rather than creating empty abstractions or unnecessary layers.

Avoid a microservices architecture for the initial deployment.

## 12. Configuration and documentation

Update `package.json`, `.env.example`, and `README.md`.

Document every new dependency, environment variable, database migration, embedding provider, storage option, ingestion step, and deployment requirement.

Provide:

- Local development setup.
- Database initialization and migration instructions.
- Template-ingestion commands.
- Embedding-model setup.
- Image-generation configuration.
- Test commands.
- Deployment instructions.
- A description of what works when optional provider credentials are missing.

Never commit real secrets or make optional external services mandatory without documenting the reason.

Use the actual installed library APIs; do not invent methods or silently swallow configuration errors.

## 13. Implementation workflow

Follow this sequence:

1. Inspect the existing codebase and identify the smallest safe migration path.
2. Write a concise implementation plan based on the actual files and dependencies.
3. Implement the data model, migrations, and template catalog.
4. Implement embeddings, hybrid retrieval, ranking, and a graceful keyword fallback.
5. Refactor caption generation, rendering, and the optional image-generation provider.
6. Integrate storage, API changes, and frontend improvements.
7. Add tests, run them, and fix failures.
8. Update configuration and documentation.
9. Summarize the completed changes, verification results, new dependencies, required environment variables, and any remaining limitations.

Do not stop after producing the plan. Continue implementing unless a genuine external blocker prevents progress.

Do not claim a test, deployment, migration, or external API call succeeded unless you actually verified it.

When a choice depends on an external API or model's current capabilities, verify the relevant official documentation before implementing it. Prefer small, reversible changes and avoid unnecessary abstractions.

## Definition of done

The upgrade is complete only when:

- Existing users can still generate memes through `/api/generate`.
- Valid stored templates can be retrieved without requiring an image-generation API.
- Template matching uses actual compatible embeddings when configured.
- Keyword retrieval remains available as a fallback.
- Retrieved templates can be captioned and rendered without relying on Imgflip credentials.
- Original-image generation is optional rather than the default path.
- All generation paths return consistent, retrievable image URLs.
- Database migrations and template ingestion are documented and reproducible.
- Automated tests pass in the supported development environment.
- The frontend supports preview, caption editing, and download.
- Errors, resource usage, and fallback behavior are handled explicitly.
- No secrets are committed, and no existing functionality is removed without a documented reason.

Prioritize correctness and maintainability over adding technologies for their own sake. The final result should be a working upgrade of SITU-MEME, not merely a demonstration of vector search or image generation.