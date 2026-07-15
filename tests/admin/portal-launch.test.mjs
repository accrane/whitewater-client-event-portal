import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPortalPath,
  buildPortalUrl,
  buildPortalUrlForOrigin,
  normalizeStoredPortalPath,
} from "../../src/lib/admin/portal-urls.ts";

test("buildPortalPath stores client portal links as relative paths", () => {
  assert.equal(buildPortalPath("abc 123"), "/e/abc%20123");
});

test("buildPortalUrl still builds absolute URLs when an origin is explicitly needed", () => {
  assert.equal(buildPortalUrl("https://example.com/", "abc"), "https://example.com/e/abc");
});

test("normalizeStoredPortalPath converts legacy absolute portal URLs to relative paths", () => {
  assert.equal(
    normalizeStoredPortalPath("http://localhost:3000/e/client-token"),
    "/e/client-token",
  );
  assert.equal(normalizeStoredPortalPath("/e/client-token"), "/e/client-token");
});

test("buildPortalUrlForOrigin displays stored paths on the current request origin", () => {
  assert.equal(
    buildPortalUrlForOrigin({
      origin: "https://live.example.com",
      portalUrl: "http://localhost:3000/e/client-token",
    }),
    "https://live.example.com/e/client-token",
  );
});
