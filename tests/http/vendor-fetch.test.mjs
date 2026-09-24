import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_RETRY_WAIT_MS,
  retryDelayMs,
  vendorFetch,
} from "../../src/lib/http/vendor-fetch.ts";

const noJitter = () => 0;

function stubFetch(responses) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next();
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

const status = (code, headers = {}) => () =>
  new Response(code === 204 ? null : "{}", { status: code, headers });

test("retryDelayMs honours Retry-After seconds and HTTP dates", () => {
  assert.equal(retryDelayMs("2", 0, 0, noJitter), 2000);
  assert.equal(retryDelayMs("0", 0, 0, noJitter), 0);
  const now = Date.parse("2026-09-24T12:00:00Z");
  assert.equal(
    retryDelayMs("Thu, 24 Sep 2026 12:00:03 GMT", 0, now, noJitter),
    3000,
  );
});

test("retryDelayMs gives up when the vendor asks for too long", () => {
  assert.equal(retryDelayMs(String(MAX_RETRY_WAIT_MS / 1000 + 1), 0, 0, noJitter), null);
});

test("retryDelayMs backs off exponentially without Retry-After", () => {
  assert.equal(retryDelayMs(null, 0, 0, noJitter), 500);
  assert.equal(retryDelayMs(null, 1, 0, noJitter), 1000);
  assert.equal(retryDelayMs("garbage", 2, 0, noJitter), 2000);
  assert.equal(retryDelayMs(null, 10, 0, noJitter), MAX_RETRY_WAIT_MS);
});

test("a GET is retried after a 429 and returns the eventual success", async () => {
  const { calls, restore } = stubFetch([
    status(429, { "retry-after": "0" }),
    status(200),
  ]);
  try {
    const response = await vendorFetch("https://api.test/x", {}, {
      label: "GHL",
      timeoutMs: 1000,
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
  } finally {
    restore();
  }
});

test("a POST is never retried, even on 429", async () => {
  const { calls, restore } = stubFetch([status(429, { "retry-after": "0" })]);
  try {
    const response = await vendorFetch(
      "https://api.test/x",
      { method: "POST", body: "{}" },
      { label: "GHL", timeoutMs: 1000 },
    );
    assert.equal(response.status, 429);
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});

test("retries stop after maxRetries and hand back the last response", async () => {
  const { calls, restore } = stubFetch([
    status(503, { "retry-after": "0" }),
    status(503, { "retry-after": "0" }),
  ]);
  try {
    const response = await vendorFetch("https://api.test/x", {}, {
      label: "GHL",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    assert.equal(response.status, 503);
    assert.equal(calls.length, 2);
  } finally {
    restore();
  }
});

test("a non-retryable error status comes straight back", async () => {
  const { calls, restore } = stubFetch([status(404)]);
  try {
    const response = await vendorFetch("https://api.test/x", {}, {
      label: "GHL",
      timeoutMs: 1000,
    });
    assert.equal(response.status, 404);
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});

test("a hung request fails with a labelled timeout error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  // AbortSignal.timeout's timer doesn't hold the event loop open (a server
  // always has other work that does); keep this test process alive.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      vendorFetch("https://api.test/x", {}, { label: "PandaDoc", timeoutMs: 20 }),
      /PandaDoc did not respond within 0.02s/,
    );
  } finally {
    clearTimeout(keepAlive);
    globalThis.fetch = original;
  }
});

test("a body that stalls after the headers fails with a labelled error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"partial":'));
          // Never finishes on its own; the request's signal ends it.
          init.signal.addEventListener("abort", () =>
            controller.error(init.signal.reason),
          );
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const response = await vendorFetch("https://api.test/x", {}, {
      label: "PandaDoc",
      timeoutMs: 30,
    });
    assert.equal(response.status, 200);
    await assert.rejects(response.text(), /PandaDoc did not finish responding within 0.03s/);
  } finally {
    clearTimeout(keepAlive);
    globalThis.fetch = original;
  }
});

test("a normal body still reads through the wrapper", async () => {
  const { restore } = stubFetch([
    () => new Response('{"ok":true}', { status: 200 }),
  ]);
  try {
    const response = await vendorFetch("https://api.test/x", {}, {
      label: "GHL",
      timeoutMs: 1000,
    });
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    restore();
  }
});
