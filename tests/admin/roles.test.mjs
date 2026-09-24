import assert from "node:assert/strict";
import test from "node:test";

import { getUserRole } from "../../src/lib/admin/roles.ts";

test("managers and coordinators keep their role", () => {
  assert.equal(getUserRole({ app_metadata: { role: "admin" } }), "admin");
  assert.equal(getUserRole({ app_metadata: { role: "coordinator" } }), "coordinator");
});

test("an account without a portal role gets no access", () => {
  // A public sign-up, or a user added straight in the Supabase dashboard.
  assert.equal(getUserRole({ app_metadata: { provider: "email" } }), null);
  assert.equal(getUserRole({ app_metadata: {} }), null);
  assert.equal(getUserRole({ app_metadata: null }), null);
  assert.equal(getUserRole({}), null);
});

test("unknown role values are not treated as access", () => {
  assert.equal(getUserRole({ app_metadata: { role: "planner" } }), null);
  assert.equal(getUserRole({ app_metadata: { role: "Admin" } }), null);
  assert.equal(getUserRole({ app_metadata: { role: true } }), null);
});

test("anonymous sessions never get access, whatever their metadata", () => {
  assert.equal(
    getUserRole({ app_metadata: { role: "admin" }, is_anonymous: true }),
    null,
  );
});
