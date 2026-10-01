import assert from "node:assert/strict";
import test from "node:test";

import { resolveViewAs, serializeViewAs, viewAsLabel } from "../../src/lib/admin/view-as.ts";

const sarah = { email: "sarah@whitewater.org", ghlUserId: "ghl-sarah", name: "Sarah Example" };
// A portal login with no GHL user behind it (a test coordinator).
const tester = { email: "test-coordinator@whitewater.org", ghlUserId: null, name: null };

test("a manager's view-as cookie round-trips, with or without a GHL match", () => {
  assert.deepEqual(resolveViewAs("admin", serializeViewAs(sarah)), sarah);
  assert.deepEqual(resolveViewAs("admin", serializeViewAs(tester)), tester);
});

test("the label is the GHL name when matched, else the login email", () => {
  assert.equal(viewAsLabel(sarah), "Sarah Example");
  assert.equal(viewAsLabel(tester), "test-coordinator@whitewater.org");
});

test("the cookie is ignored for coordinators and accounts with no role", () => {
  const cookie = serializeViewAs(sarah);
  assert.equal(resolveViewAs("coordinator", cookie), null);
  assert.equal(resolveViewAs(null, cookie), null);
});

test("a missing or malformed cookie means no view-as", () => {
  assert.equal(resolveViewAs("admin", undefined), null);
  assert.equal(resolveViewAs("admin", ""), null);
  assert.equal(resolveViewAs("admin", "not json"), null);
  assert.equal(resolveViewAs("admin", "null"), null);
  assert.equal(resolveViewAs("admin", JSON.stringify({ name: "Sarah Example" })), null);
  assert.equal(resolveViewAs("admin", JSON.stringify({ email: " " })), null);
  assert.equal(resolveViewAs("admin", JSON.stringify({ email: 7 })), null);
});
