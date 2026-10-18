import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";

describe("Application API & Health Suite", () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("GET /api/health returns 200 with ok status", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.ok(body.timestamp);
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  });

  it("GET unknown route returns 404 with NOT_FOUND error code", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    assert.equal(res.status, 404);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "NOT_FOUND");
    assert.equal(body.error?.message, "Route not found.");
  });

  it("POST /api/generate with missing situation returns 400 INVALID_SITUATION", async () => {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "INVALID_SITUATION");
  });

  it("POST /api/generate with empty whitespace returns 400 INVALID_SITUATION", async () => {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situation: "    " })
    });
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "INVALID_SITUATION");
  });

  it("POST /api/generate with situation exceeding 700 chars returns 400 SITUATION_TOO_LONG", async () => {
    const longSituation = "a".repeat(701);
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situation: longSituation })
    });
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "SITUATION_TOO_LONG");
  });

  it("POST /api/generate with malformed JSON returns 400 INVALID_JSON", async () => {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ malformed json"
    });
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "INVALID_JSON");
  });
});
