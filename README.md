# SITU-MEME Generator

Turn everyday situations into classic captioned memes.

Describe what happened — an awkward moment, a small win, a very specific kind of
chaos — and SITU-MEME picks a fitting meme template, writes the captions, and
returns a finished image.

## How it works

The server runs a three-tier pipeline so you get a meme even when one service
is unavailable:

1. **Plan** — It loads the current top Imgflip templates (cached for one hour)
   and asks an LLM (via Backboard, with web search enabled) to choose the
   best-fitting template and write `topText` / `bottomText`.
2. **Caption (Tier 1)** — It renders the chosen trending Imgflip template with
   the generated captions.
3. **Caption (Tier 2)** — If that fails, it tries the built-in classic
   templates (Drake Hotline Bling, Monkey Puppet).
4. **Generate (Tier 3)** — If Imgflip is unavailable or unconfigured, it falls
   back to generating an original image with Google Gemini.

The response includes which `source` produced the image
(`imgflip-trending`, `imgflip-classic`, or `gemini`).

## Requirements

- Node.js 18 or newer

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in the keys you want to use (see below), then start the server:

   ```bash
   npm start
   ```

4. Open <http://localhost:3000> and describe a situation.

For development with automatic restarts on file changes:

```bash
npm run dev
```

## Configuration

Set these in `.env` (see `.env.example` for a template).

| Variable            | Required | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `PORT`              | No       | Port the server listens on. Defaults to `3000`.                             |
| `BACKBOARD_API_KEY` | Yes\*    | Key for the Backboard LLM that picks the template and writes captions.      |
| `IMGFLIP_USERNAME`  | No       | Imgflip account username, needed to render captioned memes.                 |
| `IMGFLIP_PASSWORD`  | No       | Imgflip account password.                                                   |
| `GEMINI_API_KEY`    | No       | Google Gemini key used for the image-generation fallback.                   |
| `GEMINI_MODEL`      | No       | Gemini model for the fallback. Defaults to `gemini-2.5-flash`.              |

\* If `BACKBOARD_API_KEY` is missing, the app still serves requests using a
classic fallback plan. Imgflip credentials are optional — without them the app
skips the Imgflip tiers and goes straight to Gemini. Gemini is required only
when Imgflip is unavailable or not configured.

## API

### `POST /api/generate`

Generate a meme from a situation description.

**Request body**

```json
{
  "situation": "I confidently presented the wrong tab during a company-wide demo."
}
```

`situation` is required and must be 700 characters or fewer.

**Success response**

```json
{
  "success": true,
  "url": "https://i.imgflip.com/....jpg",
  "source": "imgflip-trending",
  "template": "Drake Hotline Bling"
}
```

**Error response**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SITUATION",
    "message": "Please describe the situation first."
  }
}
```

### Example

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"situation":"I confidently presented the wrong tab during a company-wide demo."}'
```

## Project structure

```
.
├── public/
│   └── index.html   # Single-page front end (form, preview, status messages)
├── server.js        # Express server and meme generation pipeline
├── .env.example     # Environment variable template
└── package.json
```

## Notes

- Imgflip template lists are cached in memory for one hour to reduce upstream
  calls.
- Requests to upstream services time out after 25 seconds.
- Errors are returned with a stable `error.code` so the front end can show a
  friendly message.
## sample output
check out /output folder.
