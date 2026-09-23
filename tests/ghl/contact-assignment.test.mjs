import assert from "node:assert/strict";
import test from "node:test";

import { planContactAssignments } from "../../src/lib/ghl/contact-assignment.ts";

const opportunity = (overrides) => ({
  id: "opp",
  contactId: "contact",
  assignedTo: "user",
  status: "open",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

test("each assigned opportunity yields one contact assignment", () => {
  const plan = planContactAssignments([
    opportunity({ id: "a", contactId: "c1", assignedTo: "u1" }),
    opportunity({ id: "b", contactId: "c2", assignedTo: "u2" }),
  ]);
  assert.deepEqual(plan, [
    { contactId: "c1", ghlUserId: "u1", opportunityId: "a" },
    { contactId: "c2", ghlUserId: "u2", opportunityId: "b" },
  ]);
});

test("opportunities without a contact or an assignee are ignored", () => {
  const plan = planContactAssignments([
    opportunity({ id: "a", contactId: null }),
    opportunity({ id: "b", assignedTo: null }),
    opportunity({ id: "c", assignedTo: "  " }),
  ]);
  assert.deepEqual(plan, []);
});

test("a contact with several opportunities follows the newest open one", () => {
  const plan = planContactAssignments([
    opportunity({ id: "old", assignedTo: "u-old", createdAt: "2025-05-01T00:00:00Z" }),
    opportunity({ id: "new", assignedTo: "u-new", createdAt: "2026-03-01T00:00:00Z" }),
  ]);
  assert.deepEqual(plan, [{ contactId: "contact", ghlUserId: "u-new", opportunityId: "new" }]);
});

test("an open opportunity outranks a newer closed one", () => {
  const plan = planContactAssignments([
    opportunity({ id: "won", assignedTo: "u-won", status: "won", createdAt: "2026-06-01T00:00:00Z" }),
    opportunity({ id: "open", assignedTo: "u-open", status: "open", createdAt: "2026-02-01T00:00:00Z" }),
  ]);
  assert.deepEqual(plan, [{ contactId: "contact", ghlUserId: "u-open", opportunityId: "open" }]);
});

test("an unassigned newer opportunity does not hide an older assigned one", () => {
  const plan = planContactAssignments([
    opportunity({ id: "new", assignedTo: null, createdAt: "2026-06-01T00:00:00Z" }),
    opportunity({ id: "old", assignedTo: "u1", createdAt: "2026-01-01T00:00:00Z" }),
  ]);
  assert.deepEqual(plan, [{ contactId: "contact", ghlUserId: "u1", opportunityId: "old" }]);
});
